#!/bin/bash
# Download Natural Earth GeoJSON data for the Knowledge Map.
# Raw inputs (processed by process-countries.mjs) are cached in data/raw and
# only downloaded if missing. Display-ready files go straight to public/geo.
set -e

GEO_DIR="$(dirname "$0")/../public/geo"
RAW_DIR="$(dirname "$0")/../data/raw"
mkdir -p "$GEO_DIR" "$RAW_DIR"

BASE="https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"

fetch_raw() { # $1 = NE filename, $2 = local name
  if [ -f "$RAW_DIR/$2" ]; then
    echo "Cached: $2"
  else
    echo "Downloading $2..."
    curl -sL "$BASE/$1" -o "$RAW_DIR/$2"
  fi
}

fetch_raw ne_110m_admin_0_countries.geojson countries-110m-raw.geojson
fetch_raw ne_50m_admin_0_countries.geojson countries-50m-raw.geojson
fetch_raw ne_10m_admin_0_countries.geojson countries-10m-raw.geojson
fetch_raw ne_10m_populated_places.geojson cities-raw.geojson
fetch_raw ne_10m_admin_1_states_provinces.geojson admin1-raw.geojson
fetch_raw ne_50m_geography_regions_polys.geojson regions-raw.geojson
fetch_raw ne_50m_geography_regions_elevation_points.geojson elevation-points-raw.geojson
# Rivers are processed (flow-orientation) by process-countries.mjs, so they go to
# data/raw; the 50m ocean is the coastline reference that decides each river's mouth.
fetch_raw ne_50m_rivers_lake_centerlines.geojson rivers-raw.geojson
fetch_raw ne_10m_rivers_lake_centerlines.geojson rivers-10m-raw.geojson
fetch_raw ne_10m_lakes.geojson lakes-10m-raw.geojson
fetch_raw ne_50m_ocean.geojson ocean-50m-raw.geojson
# Time zones — polygons per UTC offset; processed into boundary lines by the script.
fetch_raw ne_10m_time_zones.geojson timezones-raw.geojson

echo "Downloading lakes..."
curl -sL "$BASE/ne_50m_lakes.geojson" -o "$RAW_DIR/lakes-raw.geojson"
cp "$RAW_DIR/lakes-raw.geojson" "$GEO_DIR/lakes.geojson"

echo "Downloading ocean polygons..."
curl -sL "$BASE/ne_110m_ocean.geojson" -o "$GEO_DIR/oceans.geojson"

echo "Downloading marine areas (seas, gulfs, straits)..."
curl -sL "$BASE/ne_50m_geography_marine_polys.geojson" -o "$RAW_DIR/seas-raw.geojson"
cp "$RAW_DIR/seas-raw.geojson" "$GEO_DIR/seas.geojson"

echo "All downloads complete!"
