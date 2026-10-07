import * as THREE from 'three';

// Fit the installed bounding box in the current camera direction, including
// near/far corners. A bounding sphere wastes most of a wide machine's viewport.
export function cameraDistance(box,camera,target){
 const center=box.getCenter(new THREE.Vector3()),back=camera.position.clone().sub(target);
 if(back.length()<1e-9)back.set(1.5,1,1.6);back.normalize();
 const right=new THREE.Vector3().crossVectors(camera.up,back).normalize(),up=new THREE.Vector3().crossVectors(back,right).normalize();
 const vertical=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),horizontal=vertical*camera.aspect;
 let distance=0;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
  const p=new THREE.Vector3(x,y,z).sub(center);
  distance=Math.max(distance,p.dot(back)+Math.max(Math.abs(p.dot(right))/horizontal,Math.abs(p.dot(up))/vertical)*1.14);
 }
 return Math.max(distance,box.getSize(new THREE.Vector3()).length()*.1);
}
