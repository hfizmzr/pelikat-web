#!/bin/bash

COMPOSE_FILE="docker-compose.dev.yml"
SERVICE_NAME="web"

# Start container if not running
docker compose -f $COMPOSE_FILE up -d $SERVICE_NAME

echo "--- Connected to $SERVICE_NAME terminal ---"
echo "Commands:"
echo "  pnpm install        → install deps (no rebuild needed)"
echo "  pnpm run dev        → start Next.js dev"
echo "  pnpm add <pkg>      → install new package"
echo "  exit                → leave container"
echo ""

docker compose -f $COMPOSE_FILE exec -it $SERVICE_NAME sh