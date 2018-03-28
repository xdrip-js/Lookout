#!/bin/bash
function log
{
  echo -e "$(date +'%Y-%m-%d %H:%M:%S') $*"
}


yo="yo"
bloh=1.32
log "hello\n" $bloh $yo 
