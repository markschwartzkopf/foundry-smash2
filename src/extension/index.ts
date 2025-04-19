import NodeCG from '@nodecg/types';
import * as nodecgApiContext from './nodecg-api-context';

module.exports = function (nodecg: NodeCG.ServerAPI) {
	nodecgApiContext.set(nodecg);
  require('./startgg');
  //const stringRep = nodecg.Replicant<string>('string');
  
};