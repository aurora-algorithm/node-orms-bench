#!/bin/bash
# Prints the seeded table sizes as JSON (run in the rig): the counts the video says and draws come from here.
set -euo pipefail
psql "${DATABASE_URL:-postgres://dev:dev@127.0.0.1/bench}" -Atc "
select json_build_object(
  'users', (select count(*) from users),
  'posts', (select count(*) from posts),
  'comments', (select count(*) from comments),
  'postsPerUser', json_build_array((select min(c) from (select count(*) c from posts group by user_id) x),
                                   (select max(c) from (select count(*) c from posts group by user_id) x)),
  'commentsPerPost', json_build_array((select min(c) from (select count(*) c from comments group by post_id) x),
                                      (select max(c) from (select count(*) c from comments group by post_id) x)))"
