import { X } from 'lucide-react';
import { useLocation } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SquareLockup } from '@/components/music/Lockups';
import { EmptyState } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import type { MusicItem } from '@/data/music/types';
import { trackOfSong, useLibrary, type SavedCollection } from '@/state/library';
import { seeAllGrid, seeAllTracks } from './pageStyles';

type Mode = 'favorites' | 'albums' | 'playlists';

function modeOf(pathname: string): Mode {
  if (pathname.endsWith('/favorites')) return 'favorites';
  if (pathname.endsWith('/saved-albums')) return 'albums';
  return 'playlists';
}

function toMusicItem(collection: SavedCollection): MusicItem {
  return {
    kind: collection.kind,
    id: collection.id,
    title: collection.title,
    subtitle: collection.subtitle,
    artists: collection.artists,
    album: null,
    thumbnail: collection.thumbnail,
    wide: false,
    durationSec: null,
    explicit: false,
  };
}

const removeButton =
  'absolute top-2 right-2 z-4 grid size-7 place-items-center rounded-full bg-thin-material text-white opacity-0 transition-opacity duration-100 ease-in [backdrop-filter:saturate(180%)_blur(60px)] group-hover:opacity-100 focus-visible:opacity-100 hover:bg-key-bg max-sm:opacity-100';

/** The device library: Favorite Songs, Saved Albums, Saved Playlists. */
export default function LocalLibraryPage() {
  const { pathname } = useLocation();
  const mode = modeOf(pathname);
  const songs = useLibrary((state) => state.songs);
  const albums = useLibrary((state) => state.albums);
  const playlists = useLibrary((state) => state.playlists);
  const removeCollection = useLibrary((state) => state.removeCollection);

  if (mode === 'favorites') {
    const tracks = songs.map(trackOfSong);
    return (
      <>
        <PageHeader title="Favorite Songs" />
        {tracks.length === 0 ? (
          <EmptyState
            title="No favorite songs yet"
            detail="Use the star in the player, or Add to Favorites in a track’s ••• menu."
          />
        ) : (
          <div className={seeAllTracks}>
            <TrackList
              tracks={tracks}
              variant="playlist"
              source={{ title: 'Favorite Songs', type: 'library', id: 'favorites' }}
            />
          </div>
        )}
      </>
    );
  }

  const albumsMode = mode === 'albums';
  const collections = albumsMode ? albums : playlists;
  const title = albumsMode ? 'Saved Albums' : 'Saved Playlists';
  return (
    <>
      <PageHeader title={title} />
      {collections.length === 0 ? (
        <EmptyState
          title={albumsMode ? 'No saved albums yet' : 'No saved playlists yet'}
          detail={`Use the + button on ${albumsMode ? 'an album’s' : 'a playlist’s'} page to save it here.`}
        />
      ) : (
        <ul className={seeAllGrid}>
          {collections.map((collection) => (
            <li key={`${collection.kind}:${collection.id}`} className="group relative">
              <SquareLockup item={toMusicItem(collection)} />
              <button
                className={removeButton}
                aria-label={`Remove ${collection.title} from your library`}
                title="Remove from Library"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  removeCollection(collection.kind, collection.id);
                }}
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
