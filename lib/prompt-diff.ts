export interface PromptDiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/**
 * Computes a lightweight word/whitespace-preserving LCS diff between the
 * auto-built prompt and a user's manually edited prompt.
 */
export function computePromptDiff(
  baseText: string,
  editedText: string
): PromptDiffSegment[] {
  if (baseText === editedText) {
    return baseText ? [{ type: 'equal', text: baseText }] : [];
  }

  const a = baseText.split(/(\s+)/).filter((t) => t.length > 0);
  const b = editedText.split(/(\s+)/).filter((t) => t.length > 0);

  // Guard against extreme token lengths by falling back cleanly
  if (a.length * b.length > 180_000) {
    return [
      ...(baseText ? [{ type: 'removed' as const, text: baseText }] : []),
      ...(editedText ? [{ type: 'added' as const, text: editedText }] : []),
    ];
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = new Int32Array(rows * cols);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i * cols + j] = dp[(i + 1) * cols + (j + 1)] + 1;
      } else {
        const down = dp[(i + 1) * cols + j];
        const right = dp[i * cols + (j + 1)];
        dp[i * cols + j] = down >= right ? down : right;
      }
    }
  }

  const raw: PromptDiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      raw.push({ type: 'equal', text: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * cols + j] >= dp[i * cols + (j + 1)]) {
      raw.push({ type: 'removed', text: a[i] });
      i++;
    } else {
      raw.push({ type: 'added', text: b[j] });
      j++;
    }
  }
  while (i < a.length) {
    raw.push({ type: 'removed', text: a[i] });
    i++;
  }
  while (j < b.length) {
    raw.push({ type: 'added', text: b[j] });
    j++;
  }

  const merged: PromptDiffSegment[] = [];
  for (const seg of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === seg.type) {
      prev.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}
