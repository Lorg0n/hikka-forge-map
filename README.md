# Hikka Anime Map

This interactive map is built using embeddings of anime titles from the website **[Hikka.io](https://hikka.io)**. The goal of this map is to visually represent the similarity of anime titles based on the embeddings of their names.

## Overview

The map takes **384-dimensional vectors** representing anime title embeddings and projects them onto a **2D space**. This allows you to explore how similar different anime titles are based on their names. However, it's important to note that **reducing 384 dimensions to 2D** can often result in a loss of detail, so the map is not perfectly accurate in terms of absolute similarity.

In the future has plans to enhance the map by incorporating **genre-based similarity** in addition to title similarity, offering a more comprehensive representation of how anime are related to each other.

## Features

- **Interactive Map**: Navigate through the map to explore anime titles and their relationships.
- **Zoom and Reset Controls**: Zoom in/out and reset the map to its original state.
- **Tooltip**: Hover over a point to see information about the anime, including its title.
- **Grid and Axis**: The map includes grid lines and axes to provide a sense of spatial orientation.

## Limitations

As mentioned, this map uses a 2D projection of 384-dimensional vectors, meaning that some fine details about anime similarities might be lost during the dimensionality reduction process. Thus, the map should be considered an approximation rather than an exact science.

## Future Plans

We are working on integrating **genre-based similarity** into the map, which will provide an even more accurate representation of how anime titles are related not only by their names but also by their genres. Stay tuned for future updates!

## Preview

Here's a preview of what the map looks like:

![Hikka Anime Title Map Preview](https://github.com/user-attachments/assets/d0f8baaf-8fe1-4660-ac36-a3af856c4c12)

## How to Use

1. **Zoom In/Out**: Use the "+" and "-" buttons to zoom in and out of the map.
2. **Reset**: Press the reset button (⟲) to return to the default view.
3. **Click on Points**: Move your mouse over any point on the map to view information about the anime.

## Access the Map

You can explore the Hikka Anime Title Map by visiting the following link:

[Explore the Map](https://lorg0n.github.io/hikka-forge-map/)

## Technologies Used

- **HTML/CSS**: For the basic structure and styling of the page.
- **JavaScript**: For rendering the interactive map and handling user interactions.
- **Embeddings**: Based on data from Hikka.io to visualize anime title similarities.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
