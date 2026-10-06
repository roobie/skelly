const MILESTONE_ID = /^\d+\.\d+$/;
const CHECKLIST_LINE = /^(\s*-\s+\[)([ x])(\]\s+)(\d+\.\d+)(?=$|\s)(.*)$/;
const LINE_BREAK = /\r?\n/;
const PR_MILESTONE_LINE = /^\s*Slice-Milestone:\s*(.*)$/;
const MILESTONE_SEPARATOR = /[\s,]+/;

export function milestonesFromPrBody(body) {
  if (typeof body !== 'string') {
    throw new TypeError('Pull request body must be a string');
  }

  const milestones = new Set();
  for (const [index, line] of body.split(LINE_BREAK).entries()) {
    const marker = line.match(PR_MILESTONE_LINE);
    if (!marker) {
      continue;
    }

    const ids = marker[1].split(MILESTONE_SEPARATOR).filter(Boolean);
    if (ids.length === 0) {
      throw new Error(`Slice-Milestone line ${index + 1} has no milestone id`);
    }
    for (const id of ids) {
      if (!MILESTONE_ID.test(id)) {
        throw new Error(`Invalid milestone id "${id}" on Slice-Milestone line ${index + 1}`);
      }
      milestones.add(id);
    }
  }
  return [...milestones];
}

export function tickMilestone(issueBody, id, prNumber) {
  if (typeof issueBody !== 'string') {
    throw new TypeError('Checklist issue body must be a string');
  }
  if (!MILESTONE_ID.test(id)) {
    throw new TypeError(`Invalid milestone id "${id}"`);
  }
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) {
    throw new TypeError(`Invalid pull request number "${prNumber}"`);
  }

  let matches = 0;
  const updatedLines = issueBody.split('\n').map((line) => {
    const carriageReturn = line.endsWith('\r') ? '\r' : '';
    const content = carriageReturn ? line.slice(0, -1) : line;
    const match = content.match(CHECKLIST_LINE);
    if (!match || match[4] !== id) {
      return line;
    }

    matches += 1;
    if (matches > 1) {
      throw new Error(`Multiple checklist entries found for milestone ${id}`);
    }
    if (match[2] === ' ') {
      return `${match[1]}x${match[3]}${id} — #${prNumber}${match[5]}${carriageReturn}`;
    }
    return `${content}, #${prNumber}${carriageReturn}`;
  });

  if (matches === 0) {
    throw new Error(`Checklist milestone ${id} was not found`);
  }
  return updatedLines.join('\n');
}
