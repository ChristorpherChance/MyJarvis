/** Only explicit, local transport proxying for public model files. No model API credentials. */
import {ProxyAgent,fetch as transportFetch} from 'undici';
let dispatcher;
if(process.env.JARVIS_PUBLIC_ASSET_PROXY){const url=new URL(process.env.JARVIS_PUBLIC_ASSET_PROXY);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw Error('Public asset proxy must be credential-free loopback HTTP');dispatcher=new ProxyAgent(url.href);}
export const publicAssetFetch=(url,options={})=>transportFetch(url,{...options,...dispatcher?{dispatcher}:{}});
export const closePublicAssetFetch=()=>dispatcher?.close();
