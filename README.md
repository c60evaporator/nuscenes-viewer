# nuscenes-viewer
[![license](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/c60evaporator/nuscenes-viewer/blob/main/LICENSE)
![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

**A web-based viewer and annotation tool for the nuScenes autonomous driving dataset.**

<div align="center">

**English** | 🇯🇵 [日本語版はこちら](docs/README_ja.md)

</div>

## Demo

<img src=docs/images/screenshot_sample.png>

<img src=docs/images/screenshot_samplemap.png>

## Features

nuscenes-viewer is an open source visualization and annotation tool for the nuScenes-formatted dataset.

- **User-friendly GUI**
  Browse and select scenes, samples, instances, and annotations from a clean interface, then visualize them with interactive images and bounding boxes.

- **Multi-faceted Annotation**
  Annotate using Konva 2D graphics, a Unity-like gizmo, GUI buttons, and keyboard shortcuts. Bounding boxes are displayed across camera images, BEV point clouds, and 3D point clouds simultaneously.

- **Map expansion Compatibility**
  Visualize map features as interactive polygons and lines to instantly grasp the full structure of an HD map.

## Prerequisites

- Docker & Docker Compose
- nuScenes dataset ([license required](https://www.nuscenes.org/nuscenes#download))
- Chrome browser

## Getting Started
### 1. Clone the repository

```bash
git clone https://github.com/c60evaporator/nuscenes-viewer.git
```

### 2. Place nuScenes data

Please place the nuScenes dataset or make a symbolic link as follows.

If you want to download the nuScenes dataset from scratch, [see here](docs/nuscenes_download.md).

```
root/
├── backend
:
└── data
    ├─ .gitkeep
    └─ nuscenes <- place the dataset or make a symbolic link here
        ├─ v1.0-mini
        ├─ v1.0-trainval (optional)
        ├─ samples
        ├─ sweeps
        └─ maps
            :
            └─ expansion <- Map expansion
```

Also you can specify another dataset path by changing `NUSCENES_DATAROOT` variable in `.env`.

### 3. Configure environment variables

Copy `.env.example` to `.env` and edit the values as needed.

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `APP_ENV` | Runtime environment (`development` \| `production`) | `development` |
| `POSTGRES_USER` | DB user with DDL permissions (for migrations) | `nusc_migrator` |
| `POSTGRES_PASSWORD` | Password for `POSTGRES_USER` | **Change this** |
| `POSTGRES_APP_USER` | DB user for the API (limited permissions) | `nusc_app` |
| `POSTGRES_APP_PASSWORD` | Password for `POSTGRES_APP_USER` | **Change this** |
| `POSTGRES_DB` | Database name | `nusc_viewer` |
| `PGADMIN_EMAIL` | pgAdmin login email (dev only) | `pgadmin@sample.com` |
| `PGADMIN_PASSWORD` | pgAdmin login password (dev only) | `pgadmin` |
| `NUSCENES_DATAROOT` | Path to the nuScenes dataset on the host | `./data/nuscenes` |

> **Note:** In production, set `NUSCENES_DATAROOT` to an absolute path.
> `PGADMIN_*` variables are only used in development (`docker-compose.yml`) and ignored in production.

### 4. Launch

Launch all containers

For dev

```bash
make dev
```

For production

```bash
make prod
```

### 5. Migration and data import (Only first time)

This app must load the nuScenes metadata to PostGIS DB before using it, so please run the following commands.

```bash
# Migration (make sure the db container is launched in advance)
make migrate
# Import Mini dataset
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-mini
# Import Map expansion
docker compose exec api python scripts/import_nuscenes_map.py
```

Also you can import Trainval dataset as follows

```bash
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-trainval
```

Now you can open the app `http://localhost:3000` by Chrome browser. If you launch the app on the remote server, you can access the app by `http://{please specify the host}:3000`.

## Usage
### Visualization
### Annotation (Bounding Box)
### Annotation (Map expansion)

## Roadmap

- [ ] CAN bus expansion
- [ ] AI-assisted annotation
    - [ ] Automated bounding box annotation by 3D object detection (e.g. BEVFormer, BEVFusion)
    - [ ] Validation for unmatched instances based on the location and the appearance
- [ ] Inference and evaluation GUI for AI models
    - [ ] 3D object detection
    - [ ] Multiple object tracking (MOT)
    - [ ] End-to-End autonomous driving models (E2E)
- [ ] VQA task support

## Contributing

Contributions are welcome! Although this is a personal project, I'd love to improve
it with the help of the autonomous driving and nuScenes community.

### Ways to contribute

- **Bug reports** — Open an issue if you find unexpected behavior.
- **Feature requests** — Have an idea? Feel free to open a discussion or issue.
- **Pull requests** — Fixes and improvements are always appreciated.

### Getting started

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Open a Pull Request

### Community

If you use nuscenes-viewer in your research or project, I'd be happy to hear about it.
Feel free to reach out via GitHub Issues or Discussions.

If you find this tool useful, please consider giving it a ⭐ — it helps others discover the project.

## License

This project is released under the [Apache 2.0 license](LICENSE).
