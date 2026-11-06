import { Check, Plus, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { BackButton } from '@/components/BackButton';
import { PrefetchLink } from '@/components/PrefetchLink';
import { PlayIcon } from '@/components/icons/Transport';
import { useSetListSaved, useSignedIn } from '@/data/music/queries';
import type { AppleMotion } from '@/data/apple/motionArt';
import type { HeaderInfo } from '@/data/music/types';
import { useLibrary, type SavedCollection } from '@/state/library';
import { Artwork } from './Artwork';
import { ExplicitBadge } from './ExplicitBadge';
import { MotionArtwork } from './MotionArtwork';
import { artistHref } from './links';

interface DetailHeaderProps {
  info: HeaderInfo;
  onPlay: () => void;
  onShuffle: () => void;
  canPlay: boolean;
  /** More actions after the library toggle (a Spotify playlist's Import). */
  extra?: React.ReactNode;
  /** Apple's motion artwork for an album, over the cover once it plays. */
  motion?: AppleMotion | null;
  /** The album or playlist this header belongs to, for the device library. */
  collection?: { kind: SavedCollection['kind']; id: string };
}

/** Shuffle (circle) · Play (pill), report §14; also the Spotify playlist's Import button. */
export const detailButton = {
  pill: 'inline-flex h-9 min-w-[150px] items-center justify-center gap-1.5 rounded-[24px] bg-pill-bg px-3 type-title-3-emphasized text-pill disabled:opacity-40 enabled:hover:opacity-90',
  circle:
    'grid size-9 place-items-center rounded-full border-[0.75px] border-quaternary bg-quinary text-primary disabled:opacity-40 enabled:hover:bg-quaternary',
};

/**
 * Album and playlist header (report §3, §14): artwork with its glow, title,
 * artist, metadata, a three-line description, then Shuffle · Play.
 */
export function DetailHeader({ info, onPlay, onShuffle, canPlay, extra, motion, collection }: DetailHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const signedIn = useSignedIn();
  const setSaved = useSetListSaved();
  const localSaved = useLibrary((state) =>
    collection
      ? (collection.kind === 'album' ? state.albums : state.playlists).some((item) => item.id === collection.id)
      : false,
  );
  const saveCollection = useLibrary((state) => state.saveCollection);
  const removeCollection = useLibrary((state) => state.removeCollection);
  const remote = signedIn ? info.library : null;
  const saved = collection ? localSaved : remote?.saved === true;
  const canSave = !!collection || !!remote;

  const toggleSaved = () => {
    if (collection) {
      if (localSaved) {
        removeCollection(collection.kind, collection.id);
        if (signedIn && info.library) {
          setSaved.mutate({ playlistId: info.library.playlistId, saved: false });
        }
      } else {
        saveCollection({
          kind: collection.kind,
          id: collection.id,
          title: info.title,
          subtitle: info.subtitle,
          meta: info.meta,
          thumbnail: info.thumbnail,
          artists: info.artists,
        });
        if (signedIn && info.library) {
          setSaved.mutate({ playlistId: info.library.playlistId, saved: true });
        }
      }
      return;
    }
    if (remote) setSaved.mutate({ playlistId: remote.playlistId, saved: !remote.saved });
  };

  return (
    <>
      <div className="mx-(--body-gutter) pt-6">
        <BackButton className="-ml-1" />
      </div>
      {/* Artwork beside the headings, description and actions; stacked and centred below 768px. */}
      <div className="mx-(--body-gutter) mb-10 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_1fr_auto] gap-x-[34px] pt-2 [grid-template-areas:'artwork_headings'_'artwork_description'_'artwork_actions'] max-md:grid-cols-[1fr] max-md:grid-rows-[auto] max-md:justify-items-center max-md:pt-4 max-md:text-center max-md:[grid-template-areas:'artwork'_'headings'_'actions'_'description']">
      <div className="relative w-[270px] self-start rounded-artwork-lg shadow-[0_10px_20px_0_var(--radiosityShadowColor)] [grid-area:artwork] max-lg:w-[220px] max-md:w-[min(270px,70vw)]">
        {info.thumbnail && (
          // A blurred copy behind the artwork: Apple's radiosity glow.
          <div className="absolute inset-0 -z-1 scale-88 opacity-30 blur-[20px] saturate-200" aria-hidden="true">
            <Artwork src={info.thumbnail} displayWidth={80} radius="var(--radius-artwork-large)" />
          </div>
        )}
        <Artwork src={info.thumbnail} displayWidth={270} radius="var(--radius-artwork-large)" eager />
        {/* Apple's motion artwork, over the cover once it's playing. */}
        {motion && (
          <MotionArtwork
            key={motion.url}
            motion={motion}
            className="absolute inset-0 size-full rounded-artwork-lg object-cover opacity-0 transition-opacity duration-600 ease-in data-ready:opacity-100"
          />
        )}
      </div>
      <div className="flex flex-col pt-[37px] [grid-area:headings] max-md:items-center max-md:pt-5">
        <h1 className="flex items-center type-large-title-emphasized leading-[30px] max-md:justify-center">
          {info.title}
          {info.explicit && <ExplicitBadge size={16} />}
        </h1>
        {info.artists.length > 0 && (
          <div className="type-large-title leading-[30px] text-primary">
            {info.artists.map((artist, i) => {
              const href = artistHref(artist.id);
              return (
                <span key={`${artist.name}-${i}`}>
                  {i > 0 && ', '}
                  {href ? (
                    <PrefetchLink to={href} className="hover:underline">
                      {artist.name}
                    </PrefetchLink>
                  ) : (
                    artist.name
                  )}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-1 type-callout-emphasized text-secondary">{[info.subtitle, info.meta].filter(Boolean).join(' · ')}</div>
      </div>
      {info.description && (
        <div className="mt-[38px] flex max-w-[440px] items-end type-body-tall text-secondary [grid-area:description] max-md:mt-5">
          <p className={expanded ? 'min-w-0' : 'min-w-0 line-clamp-3'}>
            {info.description}
          </p>
          {!expanded && info.description.length > 180 && (
            <button className="shrink-0 ps-[5px] type-subhead-emphasized text-primary" onClick={() => setExpanded(true)}>
              MORE
            </button>
          )}
        </div>
      )}
      <div className="mt-3.5 flex items-center gap-3.5 self-end [grid-area:actions]">
        <button className={detailButton.circle} aria-label="Shuffle" onClick={onShuffle} disabled={!canPlay}>
          <Shuffle size={18} strokeWidth={2.2} />
        </button>
        <button className={detailButton.pill} onClick={onPlay} disabled={!canPlay}>
          <PlayIcon size={18} />
          <span>Play</span>
        </button>
        {canSave && (
          <button
            className={detailButton.circle}
            aria-label={saved ? 'Remove from Library' : 'Save to Library'}
            aria-pressed={saved}
            title={saved ? 'Saved to your library' : 'Save to your library'}
            disabled={!collection && setSaved.isPending}
            onClick={toggleSaved}
          >
            {saved ? <Check size={18} strokeWidth={2.4} /> : <Plus size={18} strokeWidth={2.4} />}
          </button>
        )}
        {extra}
      </div>
      </div>
    </>
  );
}
