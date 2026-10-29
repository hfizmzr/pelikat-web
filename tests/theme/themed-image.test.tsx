import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemedImage, THEME_ASPECTS } from '@/components/theme/themed-image'

/**
 * Task 6 ThemedImage: reserved-box invariant — the wrapper ALWAYS renders
 * with an aspect-ratio style (zero CLS even with empty/broken src), a broken
 * or missing src swaps to the gradient fallback (never a broken-image glyph),
 * and alt text stays accessible in every state. @testing-library/react is a
 * devDependency, so the onError state path is driven with fireEvent.
 */

describe('ThemedImage', () => {
  it('renders the reserved box with the aspect style when src is undefined (fallback, no img)', () => {
    const { container } = render(
      <ThemedImage alt="Event banner" aspect="3/1" />
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.aspectRatio).toBe('3/1')
    // fallback layer, never an img element
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"][class*="bg-gradient-to-br"]')).not.toBeNull()
  })

  it('renders an img with the given src and alt when src is set', () => {
    const { container } = render(
      <ThemedImage alt="Event banner" aspect="3/1" src="https://example.test/banner.png" />
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.test/banner.png')
    expect(img?.getAttribute('alt')).toBe('Event banner')
  })

  it('onError swaps to the fallback div: no img element, no broken glyph, alt still accessible', () => {
    const { container } = render(
      <ThemedImage alt="Event banner" aspect="3/1" src="https://example.test/dead.png" />
    )
    fireEvent.error(screen.getByRole('img'))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText('Event banner')).not.toBeNull()
  })

  it('recovers: a valid src after a failed one renders an img again (error bound to the failed URL)', () => {
    const { rerender, container } = render(
      <ThemedImage alt="Event banner" aspect="3/1" src="https://example.test/dead.png" />
    )
    fireEvent.error(screen.getByRole('img'))
    expect(container.querySelector('img')).toBeNull()

    rerender(
      <ThemedImage alt="Event banner" aspect="3/1" src="https://example.test/live.png" />
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://example.test/live.png')
  })

  it('alt is present in both states', () => {
    const fallback = render(<ThemedImage alt="Badge" aspect="1/1" />)
    expect(screen.getByText('Badge')).not.toBeNull()
    fallback.unmount()

    render(<ThemedImage alt="Badge" aspect="1/1" src="https://example.test/logo.png" />)
    expect(screen.getByAltText('Badge')).not.toBeNull()
  })

  it('THEME_ASPECTS map is exact', () => {
    expect(THEME_ASPECTS).toEqual({
      banner: '3/1',
      logo: '1/1',
      badge: '1/1',
      certificate_background: '1.414/1',
    })
  })
})
