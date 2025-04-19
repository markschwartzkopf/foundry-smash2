declare global {
  let NodeCG: typeof NodeCGAPIClient;
  let nodecg: NodeCGAPIClient;
}

import { NodeCGAPIClient } from '@nodecg/types/out/client/api/api.client';

/* const stringRep = nodecg.Replicant<string>('string');

stringRep.on('change', (newVal, oldVal) => {
  console.log(`String changed from ${oldVal} to ${newVal}`);
  const stringDiv = document.getElementById('string') as HTMLDivElement;
  stringDiv.textContent = newVal || 'No String Value';
}); */