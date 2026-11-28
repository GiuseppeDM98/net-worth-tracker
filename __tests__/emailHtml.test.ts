/**
 * The email's one way back to the app (`emailAppLink`): a button to `{appUrl}/dashboard` only on an
 * https:// app URL — a dev or emulator URL in a real inbox is a link to nowhere. And the AI comment's
 * markdown (`emailMarkdownToHtml`): a table as a table, a list with no empty line between its items.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { emailAppLink, emailMarkdownToHtml } from '@/lib/server/emailHtml';
import { EMAIL_APP_LINK_LABEL } from '@/lib/utils/emailNarrative';

describe('emailAppLink', () => {
  it('renders one link to the dashboard, without the trailing slash of the app URL', () => {
    const html = emailAppLink('https://example.com/');
    expect(html.match(/<a /g)?.length).toBe(1);
    expect(html).toContain('href="https://example.com/dashboard"');
    expect(html).toContain(EMAIL_APP_LINK_LABEL);
  });

  it.each([undefined, '', 'http://localhost:3000'])('renders nothing for the app URL %s', (appUrl) => {
    expect(emailAppLink(appUrl)).toBe('');
  });
});

describe('emailMarkdownToHtml', () => {
  const TABLE = [
    'La base è 150.000 €.',
    '',
    '| Classe | Attuale | Scostamento |',
    '|---|---|---|',
    '| Azioni | 48,3% | +2,7 p.p. |',
    '| **Totale** | 100% | **+1.200 €** |',
    '',
    'Anche dentro le classi.',
  ].join('\n');

  it('renders a markdown table as a table, never as pipes', () => {
    const html = emailMarkdownToHtml(TABLE);
    expect(html).toContain('<table');
    expect(html).not.toContain('|');
    expect(html.match(/<th /g)).toHaveLength(3);
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html).toContain('<strong>Totale</strong>');
  });

  it('right-aligns a column of figures, left-aligns a column of names', () => {
    const html = emailMarkdownToHtml(TABLE);
    expect(html).toMatch(/<td style="text-align:left;[^"]*">Azioni<\/td>/);
    expect(html).toMatch(/<td style="text-align:right;[^"]*">48,3%<\/td>/);
  });

  it('puts no <br/> inside a table, nor beside it', () => {
    const html = emailMarkdownToHtml(TABLE);
    const table = html.slice(html.indexOf('<div style="overflow-x:auto'), html.indexOf('</table></div>') + 14);
    expect(table).not.toContain('<br/>');
    expect(html).toContain('</table></div>Anche dentro');
    expect(html).toMatch(/150\.000 €\.<div/);
  });

  it('puts no empty line between the items of a list, even when the model leaves one', () => {
    const html = emailMarkdownToHtml(['Quattro spese:', '- cinghia: 700 €;', '', '- assicurazione: 600 €.', '', 'Togliendole, resta poco.'].join('\n'));
    const list = html.slice(html.indexOf('<ul'), html.indexOf('</ul>') + 5);
    expect(list.match(/<li /g)).toHaveLength(2);
    expect(list).not.toContain('<br/>');
    expect(html).toContain('</ul>Togliendole');
  });

  it('nests indented bullets under their item, never printing «  - voce»', () => {
    const html = emailMarkdownToHtml(
      ['- **Sopra target:**', '', '  - Azioni 48,3% contro 45,6%.', '  - Cripto 8,4% contro 6,8%.', '- **Sotto target:**', '  - Obbligazioni 7,4%.', '', 'Fine.'].join('\n'),
    );
    expect(html).not.toMatch(/ {2}- /);
    expect(html).not.toContain('§');
    // One outer list of two items, the first holding a sub-list of two, the second a sub-list of one.
    expect(html.match(/<ul /g)).toHaveLength(3);
    expect(html).toMatch(/<strong>Sopra target:<\/strong><ul [^>]*><li [^>]*>Azioni 48,3% contro 45,6%\.<\/li><li [^>]*>Cripto 8,4% contro 6,8%\.<\/li><\/ul><\/li>/);
    expect(html).toContain('</ul></li></ul>Fine.');
    expect(html).not.toContain('<br/>');
  });

  it('nests sub-bullets under a numbered item too, and lifts the ones with no item above', () => {
    expect(emailMarkdownToHtml(['1. Primo', '   - dettaglio'].join('\n'))).toMatch(/<ol [^>]*><li [^>]*>Primo<ul [^>]*><li [^>]*>dettaglio<\/li><\/ul><\/li><\/ol>/);
    expect(emailMarkdownToHtml(['Testo:', '  - sola'].join('\n'))).toMatch(/^Testo:<ul [^>]*><li [^>]*>sola<\/li><\/ul>$/);
  });

  it('keeps a numbered list on one line too', () => {
    const html = emailMarkdownToHtml(['1. primo', '', '2. secondo'].join('\n'));
    expect(html).toMatch(/^<ol[^>]*><li[^>]*>primo<\/li><li[^>]*>secondo<\/li><\/ol>$/);
  });
});
