import { matchGroups } from './matchmaker.mjs';
const people = [
  ...['man','man','man','woman','woman','woman'].map((gender,i)=>({id:`demo-balanced-${i+1}`,age:25,status:'active',language:'ru',topic:'talk',slot:'21:00',mode:'balanced',gender,joinedAt:i})),
  ...['nonbinary','woman','man','unknown'].map((gender,i)=>({id:`demo-open-${i+1}`,age:25,status:'active',language:'ru',topic:'games',slot:'21:00',mode:'open',gender,joinedAt:i}))
];
console.log('DEMO only — synthetic participants, no real users');
console.log(JSON.stringify(matchGroups(people), null, 2));
