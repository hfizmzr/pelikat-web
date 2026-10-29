import { describe, it, expect } from 'vitest'
import { LABEL_KEYS, sanitizeLabel, sanitizeDraftLabel, fallbackLabel, resolveLabels, labelPreview } from '@/lib/theme/labels'

describe('sanitizeLabel', () => {
  it('plan vector: strips HTML tags, control chars, and surrounding whitespace', () => {
    expect(sanitizeLabel('  <b>Scroll</b>\u0000 ')).toBe('Scroll')
  })

  it('removes stray < and > characters (unclosed brackets)', () => {
    expect(sanitizeLabel('a<b')).toBe('ab')
    expect(sanitizeLabel('Bib < Number > X')).toBe('Bib X')
  })

  it('collapses internal whitespace runs (tabs/newlines included)', () => {
    expect(sanitizeLabel('Bib\t\n  Number')).toBe('Bib Number')
  })

  it('caps at 40 characters (UI cap)', () => {
    expect(sanitizeLabel('a'.repeat(41))).toBe('a'.repeat(40))
    expect(sanitizeLabel('a'.repeat(80)).length).toBe(40)
  })

  it('40-char input passes through at the boundary', () => {
    expect(sanitizeLabel('a'.repeat(40))).toBe('a'.repeat(40))
  })

  it('degenerate input → empty string (consumer applies fallback)', () => {
    expect(sanitizeLabel('   ')).toBe('')
    expect(sanitizeLabel('\u0000')).toBe('')
    expect(sanitizeLabel('<b></b>')).toBe('')
  })

  it('NEVER returns a `<` or `>` across a hostile matrix (CodeQL carry)', () => {
    const hostile = [
      '<script>alert(1)</script>',
      '<a onmouseover=x>Hi',
      '<img src=x onerror=alert(1)//',
      '<b<m>x>',
      'a<<b>>c',
      '<scr<script>ipt>x</scr</scr>ipt>', // self-nesting reconstruct after a naive pass
      '>>>DetailFraud<x', // WAF bypass vector shape
      '<',
      '>',
      '<><><>',
      'text <<b>!',
    ]
    for (const input of hostile) {
      const out = sanitizeLabel(input)
      expect(out, `input ${JSON.stringify(input)}`).not.toMatch(/[<>]/)
    }
  })

  it('P1 pinned vectors hold exactly', () => {
    expect(sanitizeLabel('  <b>Scroll</b>\u0000 ')).toBe('Scroll')
    expect(sanitizeLabel('a<b')).toBe('ab')
    expect(sanitizeLabel('Bib < Number > X')).toBe('Bib X')
    expect(sanitizeLabel('a'.repeat(41))).toBe('a'.repeat(40))
  })
})

describe('sanitizeDraftLabel', () => {
  it('keeps trailing/leading whitespace verbatim (no trim mid-typing)', () => {
    expect(sanitizeDraftLabel('Spell ')).toBe('Spell ')
    expect(sanitizeDraftLabel(' Spell')).toBe(' Spell')
    expect(sanitizeDraftLabel('Pingat Baru ')).toBe('Pingat Baru ')
  })

  it('does NOT collapse internal whitespace (user spacing preserved)', () => {
    expect(sanitizeDraftLabel('Pingat  Baru ')).toBe('Pingat  Baru ')
    // pasted tab/newline become a SPACE (same separation the save path gives)
    expect(sanitizeDraftLabel('Race\nDay')).toBe('Race Day')
    expect(sanitizeDraftLabel('Bib\tNumber')).toBe('Bib Number')
  })

  it('strips markup + stray brackets + C0 exactly like the saved path', () => {
    // no trim → the tag→space replacements stay verbatim in the draft
    expect(sanitizeDraftLabel('<b>Scroll</b> ')).toBe(' Scroll  ')
    expect(sanitizeDraftLabel('a<b')).toBe('ab')
    expect(sanitizeDraftLabel('<script>alert(1)</script>')).toBe(' alert(1) ')
  })

  it('caps at 40 (UI cap)', () => {
    expect(sanitizeDraftLabel('a'.repeat(41))).toBe('a'.repeat(40))
  })

  it('never returns a `<` or `>` (same hostile matrix as the save path)', () => {
    const hostile = [
      '<b>Spell </b>',
      '<a onmouseover=x>Hi ',
      '<scr<script>ipt>',
      '<',
      '  < x',
    ]
    for (const input of hostile) {
      expect(sanitizeDraftLabel(input)).not.toMatch(/[<>]/)
    }
  })
})

describe('fallbackLabel', () => {
  it('platform fallback map for all six keys', () => {
    expect(fallbackLabel('bib_label')).toBe('Bib Number')
    expect(fallbackLabel('checkpoint_label')).toBe('Checkpoint')
    expect(fallbackLabel('medal_label')).toBe('Medal')
    expect(fallbackLabel('run_label')).toBe('Run')
    expect(fallbackLabel('participant_label')).toBe('Participant')
    expect(fallbackLabel('certificate_label')).toBe('Certificate')
  })

  it('unknown key → empty string (ignored)', () => {
    expect(fallbackLabel('evil_key')).toBe('')
  })
})

describe('LABEL_KEYS', () => {
  it('is the fixed 6-key vocabulary (Global Constraints)', () => {
    expect([...LABEL_KEYS].sort()).toEqual([
      'bib_label',
      'certificate_label',
      'checkpoint_label',
      'medal_label',
      'participant_label',
      'run_label',
    ])
  })
})

describe('resolveLabels', () => {
  it('null → all six platform fallbacks', () => {
    expect(resolveLabels(null)).toEqual({
      bib_label: 'Bib Number',
      checkpoint_label: 'Checkpoint',
      medal_label: 'Medal',
      run_label: 'Run',
      participant_label: 'Participant',
      certificate_label: 'Certificate',
    })
  })

  it('Batik vocab passes through; bib_label absent by design → "Bib Number" fallback', () => {
    const labels = resolveLabels({
      checkpoint_label: 'Kampung',
      medal_label: 'Pingat',
      run_label: 'Larian',
      participant_label: 'Peserta',
      certificate_label: 'Sijil',
    })
    expect(labels.bib_label).toBe('Bib Number')
    expect(labels.checkpoint_label).toBe('Kampung')
    expect(labels.medal_label).toBe('Pingat')
    expect(labels.run_label).toBe('Larian')
    expect(labels.participant_label).toBe('Peserta')
    expect(labels.certificate_label).toBe('Sijil')
  })

  it('partial override: overridden keys sanitized, rest fall back', () => {
    const labels = resolveLabels({ medal_label: '  Pingat Baru ' })
    expect(labels.medal_label).toBe('Pingat Baru')
    expect(labels.bib_label).toBe('Bib Number')
    expect(labels.checkpoint_label).toBe('Checkpoint')
  })

  it('sanitizes values on the way through', () => {
    expect(resolveLabels({ bib_label: '  Nombor <b>Larian</b>\u0001 ' }).bib_label).toBe('Nombor Larian')
  })

  it('empty-after-sanitize → fallback', () => {
    expect(resolveLabels({ medal_label: '   ' }).medal_label).toBe('Medal')
    expect(resolveLabels({ medal_label: '<x>' }).medal_label).toBe('Medal')
  })

  it('unknown keys ignored; output is always exactly the 6 keys', () => {
    const labels = resolveLabels({ evil_key: 'x' } as Record<string, string>)
    expect(labels).not.toHaveProperty('evil_key')
    expect(Object.keys(labels).sort()).toEqual([...LABEL_KEYS].sort())
  })

  it('never trusts runtime value types (fuzz)', () => {
    const labels = resolveLabels({ bib_label: 42 } as unknown as Record<string, string>)
    expect(labels.bib_label).toBe('Bib Number')
  })
})

describe('labelPreview', () => {
  it('composes the bib preview template', () => {
    expect(labelPreview(resolveLabels(null).bib_label)).toBe('Your Bib Number #1234')
  })
})
