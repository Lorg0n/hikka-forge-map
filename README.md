# Hikka Anime Map

An interactive 2D map of anime from [Hikka.io](https://hikka.io). Every point is an anime slug from the Hikka database with a populated [Forge2Vec](https://github.com/Lorg0n/forge2vec) embedding.

## How the map is built

The current map is a static snapshot generated from the database rows where `anime.embedding IS NOT NULL`:

- 10,449 anime points
- 256-dimensional Forge2Vec embeddings
- 2D coordinates generated with deterministic PCA
- point identifiers taken directly from the database `slug` column

Forge2Vec combines anime descriptions, titles, genres, and available metadata. The projection makes nearby points broadly more similar in the original embedding space, but it cannot preserve every relationship from 256 dimensions. Coordinates are therefore useful for exploration, not as exact similarity scores.

The generated points are stored in [`anime_map.json`](anime_map.json) as objects with this shape:

```json
{
  "x": 12.345678,
  "y": -6.789012,
  "slug": "anime-slug-from-hikka"
}
```

## Using the map

- Drag the map to move around.
- Use `+` and `−` to zoom.
- Press `⟳` to reset the view.
- Click a point to load its anime details and open the Hikka page from the tooltip.

The map is available at [lorg0n.github.io/hikka-forge-map](https://lorg0n.github.io/hikka-forge-map/).

## Project files

- `index.html` — page structure and controls
- `style.css` — map and tooltip styling
- `script.js` — rendering, navigation, and Hikka API lookups
- `anime_map.json` — generated coordinates and database slugs

## Updating the snapshot

Regenerate `anime_map.json` after new anime embeddings are populated in the database. The map frontend expects the existing `{x, y, slug}` schema, so keep the database slug paired with the same row’s embedding during projection.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) if a license file is added to the repository.
