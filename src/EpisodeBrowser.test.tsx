import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EpisodeBrowser from './EpisodeBrowser'

function renderEpisodeBrowser(onStartDownload = vi.fn()) {
  render(
    <MantineProvider>
      <EpisodeBrowser
        sourceId="anilibria"
        animeId="1210"
        animeTitle="Ванпанчмен"
        onStartDownload={onStartDownload}
      />
    </MantineProvider>,
  )
  return onStartDownload
}

function installAnimeMock() {
  window.animedl = {
    appSettings: {
      get: vi.fn().mockResolvedValue({
        downloadPath: '',
        parallelDownloads: 1,
        proxy: { enabled: false, host: '', port: '', user: '', password: '' },
      }),
      save: vi.fn(),
      getDefaultDownloadPath: vi.fn().mockResolvedValue('/Downloads/Anime'),
    },
    dialog: { chooseDirectory: vi.fn() },
    ytdlp: { ensure: vi.fn() },
    ffprobe: { estimate: vi.fn() },
    download: { start: vi.fn(), kill: vi.fn(), onEvent: vi.fn().mockReturnValue(() => {}) },
    sources: { get: vi.fn(), save: vi.fn() },
    anime: {
      listEnabledSources: vi.fn(),
      search: vi.fn(),
      getEpisodes: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: 5 }, (_, i) => ({ index: i, title: `Серия ${i + 1}` })),
        ),
      getSources: vi.fn().mockResolvedValue([{ index: 0, title: 'AniLibria', domain: '' }]),
      getQualities: vi
        .fn()
        .mockResolvedValue([{ quality: '480', type: 'm3u8', url: 'https://example.com/480.m3u8' }]),
      getVideoUrls: vi
        .fn()
        .mockImplementation((_sourceId: string, _animeId: string, indexes: number[]) =>
          Promise.resolve(
            indexes.map((index) => [
              { quality: '480', type: 'm3u8', url: `https://example.com/ep${index}.m3u8` },
            ]),
          ),
        ),
    },
  }
}

describe('EpisodeBrowser', () => {
  beforeEach(() => {
    installAnimeMock()
  })

  it('клик по одной серии выбирает её и сам подтягивает источник/качество', async () => {
    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseUp(episode1)

    await screen.findByText('AniLibria')
    expect(screen.getByText(/Скачать выбранные \(1\)/)).toBeInTheDocument()
  })

  it('протягивание с зажатой кнопкой выбирает диапазон серий', async () => {
    renderEpisodeBrowser()

    const episode2 = await screen.findByText('Серия 2')
    const episode4 = await screen.findByText('Серия 4')

    fireEvent.mouseDown(episode2)
    fireEvent.mouseEnter(episode4)
    fireEvent.mouseUp(episode4)

    expect(screen.getByText(/Скачать выбранные \(3\)/)).toBeInTheDocument()
  })

  it('диапазон можно тянуть и в обратную сторону', async () => {
    renderEpisodeBrowser()

    const episode4 = await screen.findByText('Серия 4')
    const episode2 = await screen.findByText('Серия 2')

    fireEvent.mouseDown(episode4)
    fireEvent.mouseEnter(episode2)
    fireEvent.mouseUp(episode2)

    expect(screen.getByText(/Скачать выбранные \(3\)/)).toBeInTheDocument()
  })

  it('новый клик начинает новый выбор, а не добавляет к старому', async () => {
    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    const episode2 = await screen.findByText('Серия 2')
    const episode3 = await screen.findByText('Серия 3')

    fireEvent.mouseDown(episode1)
    fireEvent.mouseEnter(episode3)
    fireEvent.mouseUp(episode3)
    expect(screen.getByText(/Скачать выбранные \(3\)/)).toBeInTheDocument()

    fireEvent.mouseDown(episode2)
    fireEvent.mouseUp(episode2)
    expect(screen.getByText(/Скачать выбранные \(1\)/)).toBeInTheDocument()
  })

  it('shift+клик выбирает диапазон от последнего обычного клика без протягивания мышью', async () => {
    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseUp(episode1)
    expect(screen.getByText(/Скачать выбранные \(1\)/)).toBeInTheDocument()

    const episode4 = await screen.findByText('Серия 4')
    fireEvent.mouseDown(episode4, { shiftKey: true })
    fireEvent.mouseUp(episode4)
    expect(screen.getByText(/Скачать выбранные \(4\)/)).toBeInTheDocument()

    // повторный shift+клик расширяет от того же якоря (первого клика), а не
    // от последнего shift-клика
    const episode2 = await screen.findByText('Серия 2')
    fireEvent.mouseDown(episode2, { shiftKey: true })
    fireEvent.mouseUp(episode2)
    expect(screen.getByText(/Скачать выбранные \(2\)/)).toBeInTheDocument()
  })

  it('шаг выбора плеера показывается даже с единственным плеером и выбирается автоматически', async () => {
    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseUp(episode1)

    // единственная озвучка ещё не выбрана — шага "Плеер" пока нет
    await screen.findByText('AniLibria')
    expect(screen.getAllByText('AniLibria')).toHaveLength(1)

    fireEvent.click(screen.getByText('AniLibria'))

    // после выбора озвучки шаг "Плеер" появляется и сразу показывает
    // единственный вариант выбранным, без лишнего клика
    await screen.findByText('Плеер')
    expect(screen.getAllByText('AniLibria')).toHaveLength(2)
    await waitFor(() =>
      expect(window.animedl.anime.getQualities).toHaveBeenCalledWith('anilibria', '1210', 0, 0),
    )
  })

  it('несколько озвучек: сначала выбор озвучки (по алфавиту), потом плеера под неё', async () => {
    window.animedl.anime.getSources = vi.fn().mockResolvedValue([
      { index: 0, title: 'Zeta Dub', domain: 'kodikplayer.com' },
      { index: 1, title: 'Alpha Dub', domain: 'kodikplayer.com' },
      { index: 2, title: 'Alpha Dub', domain: 'aniboom.one' },
    ])

    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseUp(episode1)

    // озвучки идут по алфавиту, шага "плеер" пока нет
    const dubbingAlpha = await screen.findByText('Alpha Dub')
    await screen.findByText('Zeta Dub')
    expect(screen.queryByText('kodikplayer.com')).not.toBeInTheDocument()
    expect(screen.queryByText('aniboom.one')).not.toBeInTheDocument()

    // после выбора озвучки с двумя плеерами появляется отдельный шаг выбора плеера
    fireEvent.click(dubbingAlpha)
    const playerKodik = await screen.findByText('kodikplayer.com')
    await screen.findByText('aniboom.one')
    expect(window.animedl.anime.getQualities).not.toHaveBeenCalled()

    fireEvent.click(playerKodik)
    await waitFor(() =>
      expect(window.animedl.anime.getQualities).toHaveBeenCalledWith('anilibria', '1210', 0, 1),
    )
  })

  it('кнопка "Оценить качество" запрашивает и показывает параметры видео', async () => {
    window.animedl.ffprobe.estimate = vi.fn().mockResolvedValue({
      fileSizeBytes: 300 * 1024 * 1024,
      durationSeconds: 1420,
      videoBitrateKbps: 1600,
      audioBitrateKbps: 128,
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1280,
      height: 720,
    })

    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseUp(episode1)
    fireEvent.click(await screen.findByText('AniLibria'))

    const estimateButton = await screen.findByText('Оценить качество')
    fireEvent.click(estimateButton)

    expect(window.animedl.ffprobe.estimate).toHaveBeenCalledWith({
      quality: '480',
      type: 'm3u8',
      url: 'https://example.com/480.m3u8',
    })

    await screen.findByText(/видео 1600 кбит\/с/)
    expect(screen.getByText(/аудио 128 кбит\/с/)).toBeInTheDocument()
    expect(screen.getByText(/h264/)).toBeInTheDocument()
    expect(screen.getByText(/aac/)).toBeInTheDocument()
  })

  it('ошибку оценки качества показывает отдельным текстом', async () => {
    window.animedl.ffprobe.estimate = vi.fn().mockRejectedValue(new Error('ffprobe не найден'))

    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseUp(episode1)
    fireEvent.click(await screen.findByText('AniLibria'))

    fireEvent.click(await screen.findByText('Оценить качество'))

    await screen.findByText('ffprobe не найден')
  })

  it('скачивание отправляет запрос для каждой выбранной серии с выбранным качеством', async () => {
    const onStartDownload = renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    const episode2 = await screen.findByText('Серия 2')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseEnter(episode2)
    fireEvent.mouseUp(episode2)

    fireEvent.click(await screen.findByText('AniLibria'))
    fireEvent.click(await screen.findByText('480p (m3u8)'))

    fireEvent.click(screen.getByText(/Скачать выбранные/))

    await waitFor(() => expect(onStartDownload).toHaveBeenCalledTimes(2))
  })
})
