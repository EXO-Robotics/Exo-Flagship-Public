/** Reassemble exact source files from bounded static uploads and verify SHA-256. */
const hex = (bytes) => [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_TRANSPORT_BYTES = 9 * 1024 * 1024;
const CONCURRENCY = 3;

// Validate every receipt before allocating the model or starting any chunk transfer.
function validateManifest(manifest, manifestAbsolute) {
  if (!manifest || manifest.schemaVersion !== 1 || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes > MAX_FILE_BYTES || !SHA256.test(manifest.sha256) || !Array.isArray(manifest.chunks) || !manifest.chunks.length || manifest.chunks.length > 64) throw new Error('Invalid source manifest.');
  let offset = 0;
  const urls = new Set();
  const chunks = manifest.chunks.map((chunk) => {
    if (!chunk || !Number.isSafeInteger(chunk.bytes) || chunk.bytes <= 0 || chunk.bytes > MAX_CHUNK_BYTES || !SHA256.test(chunk.sha256) || ![undefined, 'gzip'].includes(chunk.encoding)) throw new Error('Invalid source chunk manifest.');
    // Only plain relative file paths inside this manifest directory are accepted.
    if (typeof chunk.url !== 'string' || chunk.url.length > 512 || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(chunk.url) || chunk.url.split('/').some((part) => part === '.' || part === '..')) throw new Error('Invalid source chunk path.');
    const url = new URL(chunk.url, manifestAbsolute);
    if (url.origin !== manifestAbsolute.origin || urls.has(url.href)) throw new Error('Invalid or duplicate source chunk path.');
    urls.add(url.href);
    if (chunk.encoding === 'gzip' && (!Number.isSafeInteger(chunk.transportBytes) || chunk.transportBytes <= 0 || chunk.transportBytes > MAX_TRANSPORT_BYTES || !SHA256.test(chunk.transportSha256))) throw new Error('Invalid compressed source chunk manifest.');
    const receipt = { ...chunk, url, offset };
    offset += chunk.bytes;
    if (offset > manifest.bytes) throw new Error('Source file length does not match its manifest.');
    return receipt;
  });
  if (offset !== manifest.bytes) throw new Error('Source file length does not match its manifest.');
  if (chunks.some((chunk) => chunk.encoding === 'gzip') && typeof DecompressionStream !== 'function') throw new Error('This browser cannot unpack the CAD download. Use a current browser.');
  return chunks;
}

// Cap both network and decompression streams before they can grow beyond receipts.
async function readBounded(stream, limit, signal, exact = true) {
  if (!stream) throw new Error('Source response has no readable body.');
  const reader = stream.getReader();
  const cancel = () => { reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const bytes = new Uint8Array(limit);
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (offset + value.byteLength > limit) {
        await reader.cancel('Source response exceeds its receipt.');
        throw new Error('Source response exceeds its receipt.');
      }
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    if (exact && offset !== limit) throw new Error('Source response length does not match its receipt.');
    return exact ? bytes : bytes.slice(0, offset);
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export async function loadChunkedAsset(manifestUrl, onProgress = () => {}) {
  if (!crypto.subtle) throw new Error('A secure connection is required to verify the source file.');
  const manifestAbsolute = new URL(manifestUrl, document.baseURI);
  if (!['http:', 'https:'].includes(manifestAbsolute.protocol) || manifestAbsolute.username || manifestAbsolute.password) throw new Error('Invalid source manifest URL.');
  const controller = new AbortController();
  const { signal } = controller;
  const response = await fetch(manifestAbsolute, { signal, redirect: 'error' });
  if (!response.ok) throw new Error(`Source manifest could not be downloaded (${response.status}). Retry the download.`);
  const manifest = JSON.parse(new TextDecoder().decode(await readBounded(response.body, 256 * 1024, signal, false)));
  const chunks = validateManifest(manifest, manifestAbsolute);
  const assembled = new Uint8Array(manifest.bytes);
  let next = 0;
  let loaded = 0;
  let failure;
  onProgress({ phase: 'download', loaded, total: manifest.bytes });

  async function download(chunk, index) {
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      try {
        const transfer = await fetch(chunk.url, { signal, redirect: 'error', cache: attempt ? 'reload' : 'default' });
        if (!transfer.ok) {
          await transfer.body?.cancel();
          throw new Error(`Source chunk ${index + 1} download failed (${transfer.status}).`);
        }
        let data = await readBounded(transfer.body, chunk.encoding === 'gzip' ? chunk.transportBytes : chunk.bytes, signal);
        if (chunk.encoding === 'gzip') {
          if (await sha256(data) !== chunk.transportSha256) throw new Error(`Source chunk ${index + 1} compressed transfer did not match its receipt.`);
          signal.throwIfAborted();
          const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
          data = await readBounded(stream, chunk.bytes, signal);
        }
        if (await sha256(data) !== chunk.sha256) throw new Error(`Source chunk ${index + 1} did not match its verified original.`);
        signal.throwIfAborted();
        return data;
      } catch (error) {
        signal.throwIfAborted();
        if (attempt === 2) throw new Error(`${error.message} Retry to resume a fresh verified download.`);
      }
    }
  }

  async function worker() {
    try {
      while (next < chunks.length) {
        signal.throwIfAborted();
        const index = next++;
        const chunk = chunks[index];
        const data = await download(chunk, index);
        signal.throwIfAborted();
        assembled.set(data, chunk.offset);
        loaded += data.byteLength;
        onProgress({ phase: 'download', loaded, total: manifest.bytes });
      }
    } catch (error) {
      if (!failure) {
        failure = error;
        controller.abort(error);
      }
    }
  }

  // Workers write only to predetermined, non-overlapping offsets. Completion order
  // affects verified-byte progress, never the assembled file or final hash.
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()));
  if (failure) throw failure;
  onProgress({ phase: 'verify', loaded, total: manifest.bytes });
  if (await sha256(assembled) !== manifest.sha256) throw new Error('Source file integrity check failed. Retry the download.');
  return { bytes: assembled, manifest };
}
