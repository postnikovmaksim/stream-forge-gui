import '@testing-library/jest-dom/vitest'

// jsdom не реализует ResizeObserver; используется в Mantine ScrollArea.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

// jsdom не реализует matchMedia; Mantine использует его для определения
// системной цветовой темы (defaultColorScheme="auto").
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
