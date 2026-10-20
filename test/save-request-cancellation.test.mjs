import assert from 'node:assert/strict';
import { it } from 'node:test';
import { outgoingCancellation } from '../packages/deadvox/test/browser/save-request-cancellation.mjs';

it('only owned outgoing-document Firefox cancellations bypass save-page errors, not destination failures', () => {
  const navigation = { label: 'owned fixture reload' };
  const state = { generation: 1, requestGeneration: new WeakMap(), navigationByGeneration: new Map([[0, navigation]]) };
  const request = (errorText) => ({ failure: () => ({ errorText }) });
  const outgoing = request('NS_BINDING_ABORTED');
  const destination = request('NS_BINDING_ABORTED');
  const connectionError = request('NS_ERROR_CONNECTION_REFUSED');
  state.requestGeneration.set(outgoing, 0);
  state.requestGeneration.set(destination, 1);
  state.requestGeneration.set(connectionError, 0);
  assert.equal(outgoingCancellation(outgoing, state), navigation);
  assert.equal(outgoingCancellation(destination, state), undefined);
  assert.equal(outgoingCancellation(connectionError, state), undefined);
  assert.equal(outgoingCancellation(request('NS_BINDING_ABORTED'), state), undefined);
});
