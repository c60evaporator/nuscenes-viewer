# nuscenes-viewer
[![license](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/c60evaporator/nuscenes-viewer/blob/main/LICENSE)
![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
[![CI](https://github.com/c60evaporator/nuscenes-viewer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/c60evaporator/nuscenes-viewer/actions/workflows/ci.yml)
[![Demo](https://img.shields.io/badge/Demo-Live-brightgreen?logo=amazon-aws)](https://dtq47wxfkxb2n.cloudfront.net)

**A web-based viewer and annotation tool for the nuScenes autonomous driving dataset.**

<div align="center">

**English** | 🇯🇵 [日本語版はこちら](docs/README_ja.md)

</div>

## Demo

🌐 **[Live Demo](https://dtq47wxfkxb2n.cloudfront.net)** — nuScenes mini dataset

> ⚠️ This demo uses the [nuScenes dataset](https://www.nuscenes.org/nuscenes) under the [nuScenes license](https://www.nuscenes.org/terms-of-use).
> Please note that the demo server may be occasionally.

**Visualization Demo**

<img src=docs/images/demo_visualization.gif width=90%>

**Annotation Demo**

<img src=docs/images/demo_annotation.gif width=90%>

## Features

nuscenes-viewer is an open source visualization and annotation tool for the nuScenes-formatted dataset.

- **User-friendly GUI**
  Browse and select scenes, samples, instances, and annotations from a clean interface, then visualize them with interactive images and bounding boxes.

<img src=docs/images/screenshot_sample.png width=50%>

- **Multi-faceted Annotation**
  Annotate using Konva 2D graphics, a Unity-like gizmo, GUI buttons, and keyboard shortcuts. Bounding boxes are displayed across camera images, BEV point clouds, and 3D point clouds simultaneously.

- **Map expansion Compatibility**
  Visualize map features as interactive polygons and lines to instantly grasp the full structure of an HD map.

<img src=docs/images/screenshot_samplemap.png width=50%>

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
| `DEPLOY_ENV` | Deployment envirionment (`local` \| `aws`) | `local` |
| `POSTGRES_USER` | DB user with DDL permissions (for migrations) | `nusc_migrator` |
| `POSTGRES_PASSWORD` | Password for `POSTGRES_USER` | **Change this** |
| `POSTGRES_APP_USER` | DB user for the API (limited permissions) | `nusc_app` |
| `POSTGRES_APP_PASSWORD` | Password for `POSTGRES_APP_USER` | **Change this** |
| `POSTGRES_DB` | Database name | `nusc_viewer` |
| `PGADMIN_EMAIL` | pgAdmin login email (dev only) | `pgadmin@sample.com` |
| `PGADMIN_PASSWORD` | pgAdmin login password (dev only) | **Change this** |
| `NUSCENES_DATAROOT` | Path to the nuScenes dataset on the host | `./data/nuscenes` |

> **Note:** In production, set `NUSCENES_DATAROOT` to an absolute path.
> `PGADMIN_*` variables are only used in development (`docker-compose.yml`) and ignored in production.

### 4. Launch

Launch all containers

Before startup, ensure init scripts are executable. This is handled automatically by `make dev` and `make prod`.

For dev

```bash
make dev
```

For production

```bash
make prod
```

If you run Docker Compose directly instead of Makefile, run this once before `docker compose up`:

```bash
chmod +x db/initdb.d/*.sh
```

### 5. Migration

Run the migration to create a database.

```bash
# Migration (make sure the db container is launched by `make dev` in advance)
make migrate
```

### 6. Data import

This app must load the nuScenes metadata to PostGIS DB before using it, so please run the following commands.

```bash
# Import Mini dataset
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-mini
# Import Map expansion
docker compose exec api python scripts/import_nuscenes_map.py
```

Also you can import Trainval dataset as follows (Trainval dataset is huge, so it may take more than 10 minutes).

```bash
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-trainval
```

Now you can open the app `http://localhost:3000` by Chrome browser. If you launch the app on the remote server, you can access the app by `http://{please specify the host}:3000`.

## Usage

> 💡 **Quick Start**: Select a map → Choose a scene → Click "Samples"

---

### Visualization

#### Scene — Browse and explore driving scenarios

<img src=docs/images/usage_scene.gif width=80%>

Select a map from the drop-down menu, then choose a scene from the list.
Each scene contains 40 samples (~20 seconds of driving data).
From the following buttons on the right pane, you can deep-dive into the dataset

| Button | What it shows |
|--------|--------------|
| **Samples** | Camera images, LiDAR/RADAR point clouds, and bounding box annotations |
| **Instances** | All tracked objects across the full scene timeline |
| **Sample & Map** | Sensor data overlaid on the HD map |

---

#### Sample

<img src=docs/images/usage_sample.gif width=80%>

Navigate frames using the **slider** or by clicking the list on the left pane.

- **Click a bounding box** or the instance list on the right pane to highlight an object across all sensors simultaneously
- **Double-click** an instance in the list to jump to the Instance view
- **Click "Annotations"** to open the annotation editor for the current frame

---

### Annotations (Bounding Boxes)

<img src=docs/images/annotation_bev.png width=70%>

Open the annotation editor by clicking the "**Annotations**" button on the Sample page.

You can edit bounding boxes in four ways:

1. **LIDAR_TOP (BEV)**: Translate by mouse drag, resize and rotate using handles
2. **3D Point Cloud**: Drag handles or Unity-style gizmos to translate and rotate
3. **Right pane buttons**: Edit step-by-step using the move/resize/rotate buttons, or enter values directly in the numeric input fields
4. **Keyboard**: Translate, rotate, and resize using keyboard shortcuts

All edits are synchronized in real time across all views (LIDAR_TOP / camera images / 3D point cloud / right pane numeric fields). Each operation is recorded as one undo step.

#### 1. LIDAR_TOP (BEV)

<img src=docs/images/annotation_bev.png width=50%>

Edit using the orange rectangle overlay displayed on the LIDAR_TOP top-down view.

| Operation | Action |
|---|---|
| Drag inside the rectangle | Translate (z-coordinate remains unchanged) |
| Drag corner or edge-center anchors | Resize (center-fixed, width/length only; height unchanged) |
| Drag the rotation handle above the rectangle | Rotate around the z-axis (yaw) |
| Drag outside the rectangle | Pan (view movement) |
| Mouse wheel | Zoom |

#### 2. 3D Point Cloud

<img src=docs/images/annotation_three.png width=50%>

In the 3D view, the editing BBox is displayed with TransformControls gizmos for translation and rotation.

| Operation | Action |
|---|---|
| Move mouse into 3D view + press `W` | Translate mode (arrow handles shown) |
| Move mouse into 3D view + press `E` | Rotate mode (ring handles shown) |
| Drag an arrow handle (translate mode) | Translate along the corresponding axis (X=red=forward, Y=green=left, Z=blue=up) |
| Drag a ring handle (rotate mode) | Rotate around the corresponding axis (3-axis free: yaw/pitch/roll) |
| Drag outside the gizmo | Rotate view |
| Right-click drag | Pan view |
| Mouse wheel | Zoom |

Resizing is not available in the 3D view. Use LIDAR_TOP, the right pane, or keyboard shortcuts to change size.

#### 3. Right Pane Buttons

<img src=docs/images/annotation_button.png width=40%>

Twelve buttons are arranged in the "Bounding box ctrl" area of the right pane. Each button performs one step on click, or repeats continuously while held down (one undo step per press-and-release).

| Button | Action |
|---|---|
| ↺ / ↻ | Rotate 5 degrees around the global z-axis (counter-clockwise / clockwise) |
| ▲ / ▼ / ► / ◄ | Translate 0.1m in ego coordinates (forward / backward / right / left) |
| +W / -W | Expand/shrink width by 0.1m (center-fixed) |
| +L / -L | Expand/shrink length by 0.1m (center-fixed) |
| +H / -H | Expand/shrink height by 0.1m (bottom-fixed, top moves) |

You can also enter values directly in the translation, size, and rotation input fields. Press Enter (or move focus away) to apply, or Escape to cancel.

#### 4. Keyboard

During an editing session, the following shortcuts are active (except when typing in an input field):

| Key | Action |
|---|---|
| `→` | Translate in ego_x+ direction (screen right, forward) |
| `←` | Translate in ego_x- direction |
| `↑` | Translate in ego_y+ direction (screen up, left) |
| `↓` | Translate in ego_y- direction |
| `U` | Translate in ego_z+ direction (up) |
| `O` | Translate in ego_z- direction (down) |
| `I` | Expand length |
| `K` | Shrink length |
| `J` | Expand width |
| `L` | Shrink width |
| `M` | Rotate counter-clockwise around global z-axis (left rotation) |
| `.` | Rotate clockwise around global z-axis (right rotation) |
| `Shift + any key` | Larger step (10x) |
| `Ctrl+Z`(Windows) / `Cmd+Z`(Mac) | Undo |
| `Ctrl+Y`(Windows) / `Cmd+Shift+Z`(Mac) | Redo |

Holding a key down triggers continuous execution. One undo step is recorded per key press-and-release.

---

### Annotation (Map expansion)

Comming soon

---

### Database operation

#### Migration (database schema update)

When the database schema is needed to be updated, run the following command.

```bash
docker compose run -v ./backend/alembic:/app/alembic --rm migrations alembic upgrade head
```

#### Delete and re-construct the database

To completely delete the database, run the following command

```bash
docker compose down -v
```

To import the dataset again, run the follwing command after locate the dataset properly

```bash
# Launch the system
make dev
# Migration
make migrate
# Import Mini dataset (Please change the dataset name such as `v1.0-trainval`)
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-mini
# Import Map expansion
docker compose exec api python scripts/import_nuscenes_map.py
```

## Roadmap

- [ ] Map expansion annotation
- [ ] CAN bus expansion
- [ ] AI-assisted annotation
    - [ ] Automated bounding box annotation by 3D object detection (e.g. BEVFormer, BEVFusion)
    - [ ] Validation for unmatched instances based on the location and the appearance
    - [ ] Align bounding box bottom to the nearest bounding box
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
