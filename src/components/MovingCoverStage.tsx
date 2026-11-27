import { useEffect, useMemo, useState } from 'react';
import { Layers, Music2, Pause, Play } from 'lucide-react';
import type { Track } from '../../shared/types';

interface MovingCoverStageProps {
  track: Track;
  isPlaying: boolean;
}

interface SlideCardSpec {
  id: string;
  label: string;
  src?: string;
  animClass: string;
  sizeClass: string;
  imgClass: string;
  showCaption?: boolean;
  delayStyle: string;
}

export function MovingCoverStage({ track, isPlaying }: MovingCoverStageProps) {
  const [slidesEnabled, setSlidesEnabled] = useState(true);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setFailedUrls({});
  }, [track.id]);

  const uniqueSources = useMemo(() => {
    const raw = [
      ...(Array.isArray(track.slideUrls) ? track.slideUrls : []),
      ...(track.artworkUrl ? [track.artworkUrl] : []),
    ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
    return Array.from(new Set(raw));
  }, [track.slideUrls, track.artworkUrl]);

  const primaryArt = uniqueSources.find((u) => !failedUrls[u]) ?? uniqueSources[0];
  const hasMultipleRealFrames = uniqueSources.length > 1;

  const slideSpecs: SlideCardSpec[] = useMemo(() => {
    const pick = (idx: number) =>
      uniqueSources.length > 0 ? uniqueSources[idx % uniqueSources.length] : undefined;
    return [
      {
        id: 'front-tl-br',
        label: '01 · FRONT',
        src: pick(0),
        animClass: 'animate-slide-tl-br',
        sizeClass: 'w-28 sm:w-36 aspect-square',
        imgClass: 'object-cover',
        delayStyle: '0s',
      },
      {
        id: 'detail-bl-tr',
        label: hasMultipleRealFrames ? '02 · FRAME' : '02 · CROP',
        src: pick(1),
        animClass: 'animate-slide-bl-tr',
        sizeClass: 'w-32 sm:w-40 aspect-[4/3]',
        imgClass: hasMultipleRealFrames
          ? 'object-cover'
          : 'object-cover object-top scale-[1.28]',
        delayStyle: '-2.5s',
      },
      {
        id: 'wide-wander',
        label: hasMultipleRealFrames ? '03 · CUT' : '03 · SLEEVE',
        src: pick(2),
        animClass: 'animate-slide-wander',
        sizeClass: 'w-36 sm:w-44 aspect-video',
        imgClass: hasMultipleRealFrames
          ? 'object-cover'
          : 'object-cover object-bottom scale-[1.18]',
        delayStyle: '-4.2s',
      },
      {
        id: 'title-card',
        label: '04 · PAGE',
        src: pick(3),
        animClass: 'animate-slide-reverse',
        sizeClass: 'w-40 sm:w-48',
        imgClass: 'object-cover',
        showCaption: true,
        delayStyle: '-1.8s',
      },
    ];
  }, [uniqueSources, hasMultipleRealFrames]);

  const motionActive = isPlaying && slidesEnabled;
  const pausedClass = motionActive ? '' : 'slide-paused';

  const markFailed = (url?: string) => {
    if (!url) return;
    setFailedUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  };

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-[#070611] overflow-hidden relative">
      {/* Blurred Ambient Song Front-Page Backdrop */}
      {primaryArt && !failedUrls[primaryArt] ? (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <img
            src={primaryArt}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => markFailed(primaryArt)}
            className={`w-full h-full object-cover opacity-30 blur-md ${pausedClass} animate-slide-kenburns`}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#06050E]/85 via-[#0E0B22]/65 to-[#06050E]/90" />
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#FF4D1C]/15 via-[#8B5CF6]/15 to-[#06050E] pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Subtle CRT Scanlines & Stage Grid */}
      <div className="absolute inset-0 crt-scanlines opacity-20 pointer-events-none" aria-hidden="true" />

      {/* Stage Header */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.08] bg-[#06050E]/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[#A7A3C7]">
          <Layers className="w-3.5 h-3.5 text-[#67E8F9]" />
          <span>Cover Slide Stage</span>
          <span aria-hidden="true">·</span>
          <span className={motionActive ? 'text-[#FF4D1C]' : 'text-zinc-400'}>
            {!slidesEnabled ? 'Off' : isPlaying ? 'Corner Drift Active' : 'Paused'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSlidesEnabled((prev) => !prev)}
          aria-pressed={slidesEnabled}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-zinc-200 bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 rounded-md transition-colors cursor-pointer"
        >
          {slidesEnabled ? (
            <>
              <Pause className="w-3 h-3 text-[#FF4D1C]" />
              <span>Slides: On</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 text-[#67E8F9]" />
              <span>Slides: Off</span>
            </>
          )}
        </button>
      </div>

      {/* Moving Slides Viewport */}
      <div className="relative z-10 h-52 sm:h-64 w-full overflow-hidden [container-type:size]">
        {/* Corner Registration Crop Marks */}
        <span className="absolute top-2.5 left-2.5 w-3 h-3 border-t border-l border-[#67E8F9]/50 pointer-events-none z-20" />
        <span className="absolute top-2.5 right-2.5 w-3 h-3 border-t border-r border-[#67E8F9]/50 pointer-events-none z-20" />
        <span className="absolute bottom-2.5 left-2.5 w-3 h-3 border-b border-l border-[#FF4D1C]/50 pointer-events-none z-20" />
        <span className="absolute bottom-2.5 right-2.5 w-3 h-3 border-b border-r border-[#FF4D1C]/50 pointer-events-none z-20" />

        {slideSpecs.map((slide, index) => {
          const canRenderImg = Boolean(slide.src && !failedUrls[slide.src]);
          return (
            <div
              key={`${track.id}-${slide.id}`}
              style={{
                animationDelay: slide.delayStyle,
                zIndex: 10 + index,
              }}
              className={`absolute top-0 left-0 ${slide.sizeClass} ${slide.animClass} ${pausedClass} rounded-lg overflow-hidden border border-white/20 bg-[#0C0A1A]/95 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.95)]`}
            >
              <div className={`relative w-full ${slide.showCaption ? 'aspect-[16/10]' : 'h-full'} overflow-hidden bg-zinc-900`}>
                {canRenderImg ? (
                  <img
                    src={slide.src}
                    alt={`${track.title} slide ${index + 1}`}
                    referrerPolicy="no-referrer"
                    onError={() => markFailed(slide.src)}
                    className={`w-full h-full ${slide.imgClass}`}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-gradient-to-br from-[#FF4D1C]/35 via-[#1C1440] to-[#080614]">
                    <Music2 className="w-5 h-5 text-[#67E8F9] mb-1" />
                    <span className="font-display text-[11px] font-semibold text-white line-clamp-2">
                      {track.title}
                    </span>
                  </div>
                )}

                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[9px] font-mono tracking-wider text-white/90 bg-black/70 border border-white/15 rounded">
                  {slide.label}
                </span>
              </div>

              {slide.showCaption && (
                <div className="px-2.5 py-1.5 bg-[#0A0914]/95 border-t border-white/10">
                  <p className="text-[11px] font-semibold text-white truncate">{track.title}</p>
                  <p className="text-[10px] text-[#A7A3C7] truncate">{track.artist}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
