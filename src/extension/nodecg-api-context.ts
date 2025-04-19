import NodeCG from '@nodecg/types';

let context: NodeCG.ServerAPI;

export function get(): NodeCG.ServerAPI {
	return context;
}

export function set(ctx: NodeCG.ServerAPI): void {
	context = ctx;
}