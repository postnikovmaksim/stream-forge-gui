import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function installAnimedlMock() {
  const startMock = vi.fn().mockImplementation(() => Promise.resolve(`job-${Math.random()}`))

  window.animedl = {
    appSettings: {
      get: vi.fn().mockResolvedValue({
        downloadPath: '',
        parallelDownloads: 1,
        proxy: { enabled: false, host: '', port: '', user: '', password: '' },
      }),
      save: vi.fn(),
      getDefaultDownloadPath: vi.fn().mockResolvedValue('/Users/test/Downloads/Anime'),
    },
    dialog: { chooseDirectory: vi.fn() },
    ytdlp: { ensure: vi.fn() },
    download: {
      start: startMock,
      kill: vi.fn(),
      onEvent: vi.fn().mockReturnValue(() => {}),
    },
    sources: {
      get: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    },
    anime: {
      listEnabledSources: vi.fn().mockResolvedValue([{ id: 'anilibria', name: 'AniLibria' }]),
      search: vi.fn().mockResolvedValue([{ id: '1210', title: 'Ванпанчмен' }]),
      getEpisodes: vi.fn().mockResolvedValue([
        { index: 0, title: 'Серия 1' },
        { index: 1, title: 'Серия 2' },
      ]),
      getSources: vi.fn().mockResolvedValue([{ index: 0, title: 'AniLibria', domain: '' }]),
      getQualities: vi.fn().mockResolvedValue([
        { quality: '480', type: 'm3u8', url: 'https://example.com/480.m3u8' },
        { quality: '720', type: 'm3u8', url: 'https://example.com/720.m3u8' },
      ]),
      getVideoUrls: vi.fn().mockResolvedValue([
        [{ quality: '480', type: 'm3u8', url: 'https://example.com/ep1/480.m3u8' }],
        [{ quality: '480', type: 'm3u8', url: 'https://example.com/ep2/480.m3u8' }],
      ]),
    },
  }

  return startMock
}

describe('полный сценарий: поиск -> эпизоды -> качество -> скачивание', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('доводит пользователя от поиска до запуска скачивания выбранных серий', async () => {
    const startMock = installAnimedlMock()
    render(<App />)

    const input = await screen.findByPlaceholderText('Название аниме')
    fireEvent.change(input, { target: { value: 'One Punch Man' } })
    fireEvent.click(screen.getByText('Искать'))

    const resultButton = await screen.findByText('Ванпанчмен')
    fireEvent.click(resultButton)

    const episode1 = await screen.findByText('Серия 1')
    fireEvent.click(episode1)

    const sourceButton = await screen.findByText('AniLibria')
    fireEvent.click(sourceButton)

    const quality480 = await screen.findByText('480p (m3u8)')
    fireEvent.click(quality480)

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])

    const downloadButton = screen.getByText(/Скачать выбранные/)
    expect(downloadButton).not.toBeDisabled()
    fireEvent.click(downloadButton)

    await waitFor(() => expect(startMock).toHaveBeenCalledTimes(2))

    expect(startMock).toHaveBeenNthCalledWith(1, {
      title: 'ep 1 | Ванпанчмен | 480',
      url: 'https://example.com/ep1/480.m3u8',
      outputTemplate: '/Users/test/Downloads/Anime/Ванпанчмен/[AniLibria] 1. 480 Ванпанчмен.%(ext)s',
      isM3u8: true,
    })
    expect(startMock).toHaveBeenNthCalledWith(2, {
      title: 'ep 2 | Ванпанчмен | 480',
      url: 'https://example.com/ep2/480.m3u8',
      outputTemplate: '/Users/test/Downloads/Anime/Ванпанчмен/[AniLibria] 2. 480 Ванпанчмен.%(ext)s',
      isM3u8: true,
    })

    fireEvent.click(screen.getByText(/Загрузки/))
    expect(await screen.findAllByText(/ep 1 \| Ванпанчмен \| 480/)).not.toHaveLength(0)
  })
})
