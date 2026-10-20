export function outgoingCancellation(request, state) {
  if (request.failure()?.errorText !== 'NS_BINDING_ABORTED') {
    return;
  }
  const generation = state?.requestGeneration.get(request);
  return generation === undefined ? undefined : state?.navigationByGeneration.get(generation);
}
