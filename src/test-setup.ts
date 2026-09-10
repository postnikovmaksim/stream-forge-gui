import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Мы не включаем test.globals в vitest.config.ts, поэтому встроенная
// автоочистка Testing Library (которая опирается на глобальный afterEach)
// не срабатывает сама — регистрируем её явно, иначе DOM от предыдущих
// тестов в файле накапливается и ломает запросы вида getByText.
afterEach(() => {
  cleanup()
})

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
