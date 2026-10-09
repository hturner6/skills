#!/usr/bin/env bash
# Print a greeting for the given name.
name=$1
if [ -z $name ]; then
  name="world"
fi
echo "Hello, $name!"
