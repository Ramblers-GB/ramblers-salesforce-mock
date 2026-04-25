#!/bin/bash

if [ ! -d ".git" ]; then
  exit 0
fi

git config core.hooksPath .githooks
echo "Git hooks activated (core.hooksPath=.githooks)"
