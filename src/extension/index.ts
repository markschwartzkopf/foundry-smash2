import NodeCG from '@nodecg/types';
import * as nodecgApiContext from './nodecg-api-context';

module.exports = function (nodecg: NodeCG.ServerAPI) {
  nodecgApiContext.set(nodecg);
  void import('./startgg.js').catch((err) => {
    nodecg.log.error('Failed to load startgg.js', err);
  });
};
