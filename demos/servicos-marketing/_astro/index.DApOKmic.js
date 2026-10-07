import{r as a}from"./index.CVf8TyFT.js";var d={exports:{}},n={};/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var p=a,l=Symbol.for("react.element"),_=Symbol.for("react.fragment"),m=Object.prototype.hasOwnProperty,y=p.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,R={key:!0,ref:!0,__self:!0,__source:!0};function f(t,e,i){var r,o={},s=null,u=null;i!==void 0&&(s=""+i),e.key!==void 0&&(s=""+e.key),e.ref!==void 0&&(u=e.ref);for(r in e)m.call(e,r)&&!R.hasOwnProperty(r)&&(o[r]=e[r]);if(t&&t.defaultProps)for(r in e=t.defaultProps,e)o[r]===void 0&&(o[r]=e[r]);return{$$typeof:l,type:t,key:s,ref:u,props:o,_owner:y.current}}n.Fragment=_;n.jsx=f;n.jsxs=f;d.exports=n;var h=d.exports;const w=typeof window<"u",c={current:null},x={current:!1};function E(){if(x.current=!0,!!w)if(window.matchMedia){const t=window.matchMedia("(prefers-reduced-motion)"),e=()=>c.current=t.matches;t.addListener(e),e()}else c.current=!1}export{E as a,x as h,w as i,h as j,c as p};
