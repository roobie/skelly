local box(position, size) = { position: position, size: size };
{
  furniture: [
    {
      id: 'hq_meeting_table', name: 'Meeting table', size: [6, 2, 3], color: '#77664c',
      shape: [
        box([0.1, 1.7, 0.1], [5.8, 0.3, 2.8]),
        box([0.3, 0, 0.3], [0.3, 1.7, 0.3]),
        box([5.4, 0, 0.3], [0.3, 1.7, 0.3]),
        box([0.3, 0, 2.4], [0.3, 1.7, 0.3]),
        box([5.4, 0, 2.4], [0.3, 1.7, 0.3]),
      ],
    },
    {
      id: 'hq_generator', name: 'Generator', size: [4, 3, 3], color: '#59634e',
      shape: [
        box([0.1, 0, 0.1], [3.8, 0.3, 2.8]),
        box([0.3, 0.3, 0.3], [2, 1.8, 2.4]),
        box([2.3, 0.3, 0.6], [1.4, 1.3, 1.8]),
        box([0.5, 2.1, 0.5], [1.6, 0.4, 2]),
        box([0.5, 0.7, 0.1], [0.8, 0.6, 0.2]),
        box([1.6, 0.7, 0.1], [0.3, 0.3, 0.2]),
        box([3.1, 1.6, 2.1], [0.25, 1.4, 0.25]),
      ],
    },
    {
      id: 'hq_gate_leaf', name: 'Gate', size: [6, 4, 1], color: '#657265',
      door: { handlingSimSeconds: 1.2 },
      shape: [
        box([0, 0.1, 0.35], [6, 3.8, 0.3]),
        box([0.1, 0, 0.2], [0.2, 4, 0.6]),
        box([5.7, 0, 0.2], [0.2, 4, 0.6]),
      ],
    },
  ],
}
