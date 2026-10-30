import { describe, it, expect } from 'vitest'
import { rowsToCsv } from '@/lib/utils'

// csvCell is module-private here; these behavior tests go through rowsToCsv.
describe('rowsToCsv (csvCell escaping + formula-injection guard)', () => {
  it('quotes cells and doubles embedded quotes (RFC 4180)', () => {
    expect(rowsToCsv(['h'], [['a,b']])).toBe('"h"\n"a,b"')
    expect(rowsToCsv(['h'], [['say "hi"']])).toBe('"h"\n"say ""hi"""')
  })

  it('prefixes a guard quote before formula-injection prefixes', () => {
    expect(rowsToCsv(['v'], [['=SUM(A1)']])).toBe('"v"\n"\'=SUM(A1)"')
    expect(rowsToCsv(['v'], [['+cmd']])).toBe('"v"\n"\'+cmd"')
    expect(rowsToCsv(['v'], [['-1+1']])).toBe('"v"\n"\'-1+1"')
    expect(rowsToCsv(['v'], [['@cmd']])).toBe('"v"\n"\'@cmd"')
  })

  it('guards tab/CR/LF formula prefixes (OWASP CSV injection)', () => {
    expect(rowsToCsv(['v'], [['\tcmd']])).toBe('"v"\n"\'\tcmd"')
    expect(rowsToCsv(['v'], [['\rcmd']])).toBe('"v"\n"\'\rcmd"')
    expect(rowsToCsv(['v'], [['\ncmd']])).toBe('"v"\n"\'\ncmd"')
  })

  it('guards only when a prefix char is the first character', () => {
    expect(rowsToCsv(['v'], [['x=SUM(A1)']])).toBe('"v"\n"x=SUM(A1)"')
    expect(rowsToCsv(['v'], [['abc']])).toBe('"v"\n"abc"')
    expect(rowsToCsv(['v'], [[42]])).toBe('"v"\n"42"')
  })

  it('keeps finite numeric values numeric (no guard quote)', () => {
    expect(rowsToCsv(['v'], [[-10]])).toBe('"v"\n"-10"')
  })
})
