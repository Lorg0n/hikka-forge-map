# Hikka Anime Map

An interactive 2D/3D map of anime from [Hikka.io](https://hikka.io). Every point is an anime slug with a 256-dimensional [Forge2Vec](https://github.com/Lorg0n/forge2vec) embedding, clustered and projected into navigable space.

Read more about the embedding approach in the [anime2vec article series on Hikka](https://hikka.io/articles?tags=[%22forge%22%2C%22embedding%22]&author=Lorg0n).

## How the map is built

The map is a static snapshot generated from anime with populated Forge2Vec embeddings:

- **10,449** anime points
- **150** clusters derived from 256-dimensional Forge2Vec embeddings
- **2D coordinates** -- deterministic PCA projection (`x`, `y`)
- **3D coordinates** -- separate projection for the Three.js view (`x3d`, `y3d`, `z3d`)
- Point identifiers taken directly from the Hikka database `slug` column

Forge2Vec combines anime descriptions, titles, genres, and available metadata into a 256-dimensional vector. The projection makes nearby points broadly more similar in the original embedding space, but it cannot preserve every relationship. Coordinates are useful for exploration, not as exact similarity scores.

The generated points are stored in [`anime_map.json`](anime_map.json):

```json
{
  "x": 12.345678,
  "y": -6.789012,
  "slug": "anime-slug-from-hikka",
  "cluster": 42,
  "x3d": -8.7549,
  "y3d": 29.721,
  "z3d": -55.7696
}
```

Cluster color assignments live in [`cluster_colors.json`](cluster_colors.json).

## Features

- **2D and 3D views** -- toggle between a DOM-based pannable/zoomable 2D map and a Three.js-powered 3D point cloud
- **Search** -- query the [Hikka API](https://api.hikka.io) for any anime; results that exist on the map are highlighted and navigable on click
- **Cluster filter** -- toggle individual clusters on/off; filter panel with search, select-all, and deselect-all controls
- **Tooltips** -- click a point to fetch and display anime details (title, score, episode count, synopsis, cluster badge) from the Hikka API
- **Keyboard shortcuts** -- `/` to focus search, arrow keys to navigate results, `Enter` to select, `Escape` to dismiss

## Using the map

**2D mode (default)**
- Drag to pan, `+` / `-` to zoom, `⟲` to reset the view
- Click a point to see anime details; the tooltip links back to the Hikka page

**3D mode**
- Click the `3D` button to enter Three.js view
- Left-click drag to orbit, right-click drag to pan, scroll wheel to zoom
- Click a point to select it and view its tooltip
- Click `2D` to return to the flat view

**Search**
- Press `/` or click the search bar, type a query
- Arrow keys navigate results; `Enter` selects
- Results tagged "On map" pan to the point; others open the Hikka page

The map is live at [lorg0n.github.io/hikka-forge-map](https://lorg0n.github.io/hikka-forge-map/).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) if a license file is added to the repository.
