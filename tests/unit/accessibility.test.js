// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axe from 'axe-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlContent = readFileSync(join(__dirname, '../../index.html'), 'utf8');
const strippedHtml = htmlContent.replace(/<script[^>]*type="module"[^>]*>[\s\S]*?<\/script>/gi, '');

describe('Accessibilité RGAA — index.html', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = strippedHtml;
    document.documentElement.lang = 'fr'; // jsdom ne préserve pas l'attribut lang du <html> lors du innerHTML
  });

  test('aucune violation axe critique ou sérieuse', async () => {
    const results = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    const critical = results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    );
    if (critical.length > 0) {
      const details = critical.map(v =>
        `\n  [${v.impact}] ${v.id}: ${v.description}\n    Nœuds: ${v.nodes.map(n => n.target.join(', ')).join(' | ')}`
      ).join('');
      throw new Error(`${critical.length} violation(s) axe:${details}`);
    }
    expect(critical).toHaveLength(0);
  });

  test('#status a aria-live="polite"', () => {
    const el = document.getElementById('status');
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });

  test('les panneaux masqués ont aria-hidden="true"', () => {
    ['config-panel', 'devlog', 'doc-panel', 'search-skeleton'].forEach(id => {
      expect(document.getElementById(id)?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  test('tous les boutons ont un nom accessible', async () => {
    const results = await axe.run(document, {
      runOnly: { type: 'rule', values: ['button-name'] },
    });
    expect(results.violations).toHaveLength(0);
  });

  test('tous les champs ont un label', async () => {
    const results = await axe.run(document, {
      runOnly: { type: 'rule', values: ['label'] },
    });
    expect(results.violations).toHaveLength(0);
  });
});
