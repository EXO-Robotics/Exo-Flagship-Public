/** Reassemble exact source files from bounded static uploads and verify SHA-256. */
const hex = (bytes) => [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));
export async function loadChunkedAsset(manifestUrl, onProgress = () => {}) {
  if (!crypto.subtle) throw new Error('A secure connection is required to verify the source file.');
  const manifestAbsolute = new URL(manifestUrl, document.baseURI);
  const response = await fetch(manifestAbsolute);
  if (!response.ok) throw new Error(`Source manifest could not be downloaded (${response.status}). Retry the download.`);
  const manifest = await response.json();
  if (manifest.schemaVersion !== 1 || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || !Array.isArray(manifest.chunks) || !manifest.chunks.length || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('Invalid source manifest.');
  const assembled = new Uint8Array(manifest.bytes);
  let offset = 0;
  onProgress({ phase: 'download', loaded: 0, total: manifest.bytes });
  for (let index = 0; index < manifest.chunks.length; index++) {
    const chunk = manifest.chunks[index];
    if (!Number.isSafeInteger(chunk.bytes) || chunk.bytes <= 0 || chunk.bytes > 8 * 1024 * 1024 || offset + chunk.bytes > manifest.bytes || !/^[a-f0-9]{64}$/.test(chunk.sha256)) throw new Error('Invalid source chunk manifest.');
    const url = new URL(chunk.url, manifestAbsolute);
    if (url.origin !== manifestAbsolute.origin) throw new Error('Source chunks must use this showcase’s origin.');
    let data, lastError;
    // Bounded retries recover a transient transfer failure without altering the source.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const transfer = await fetch(url, {cache: attempt ? 'reload' : 'default'});
        if (!transfer.ok) throw new Error(`Source chunk ${index + 1} download failed (${transfer.status}).`);
        data = new Uint8Array(await transfer.arrayBuffer());
        if (chunk.encoding === 'gzip') {
          if (!Number.isSafeInteger(chunk.transportBytes) || data.byteLength !== chunk.transportBytes || !/^[a-f0-9]{64}$/.test(chunk.transportSha256) || await sha256(data) !== chunk.transportSha256) throw new Error(`Source chunk ${index + 1} compressed transfer did not match its receipt.`);
          if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot unpack the CAD download. Use a current browser or open the original source link.');
          const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
          data = new Uint8Array(await new Response(stream).arrayBuffer());
        } else if (chunk.encoding) throw new Error('Unsupported source chunk encoding.');
        if (data.byteLength !== chunk.bytes || await sha256(data) !== chunk.sha256) throw new Error(`Source chunk ${index + 1} did not match its verified original.`);
        lastError = null;
        break;
      } catch (error) { lastError = error; }
    }
    if (lastError) throw new Error(`${lastError.message} Retry to resume a fresh verified download.`);
    assembled.set(data, offset);
    offset += data.byteLength;
    onProgress({phase: 'download', loaded: offset, total: manifest.bytes});
  }
  if (offset !== manifest.bytes) throw new Error('Source file length does not match its manifest.');
  onProgress({phase: 'verify', loaded: offset, total: manifest.bytes});
  if (await sha256(assembled) !== manifest.sha256) throw new Error('Source file integrity check failed. Retry the download.');
  return {bytes: assembled, manifest};
}
