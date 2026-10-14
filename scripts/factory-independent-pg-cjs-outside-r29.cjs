/** Trusted immutable fixture; its cached exports must never bypass the guard. */
globalThis.__qaCJSOutsideLoads=(globalThis.__qaCJSOutsideLoads??0)+1;
module.exports={sentinel:1};
