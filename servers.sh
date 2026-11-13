# The apps under test: name -> port and the command that starts it (run from the bench folder). Sourced by the scripts.
#   node-pg kysely drizzle prisma typeorm   each library as its docs show it
#   prisma-join                             Prisma with relationLoadStrategy "join" (one query for relations)
#   drizzle-prep                            Drizzle with .prepare(): the query built once (one row, feed)
declare -A PORT=([node-pg]=8301 [kysely]=8302 [drizzle]=8303 [prisma]=8304 [typeorm]=8305 [prisma-join]=8314 [drizzle-prep]=8313)
port_of() { echo "${PORT[$1]:?unknown app $1}"; }
server_cmd() { echo "ORM=$1 exec node dist/apps/server.js"; }
# route name -> path (a regex oha fills in with a random user id) and method
route_path() {
  case $1 in
    one) echo '/users/[1-9][0-9]{0,3}' ;;
    list50) echo '/users?limit=50' ;;
    list1000) echo '/users?limit=1000' ;;
    feed) echo '/users/[1-9][0-9]{0,3}/feed' ;;
    loop) echo '/users/[1-9][0-9]{0,3}/feed-loop' ;;
    write) echo '/users' ;;
    *) echo "unknown route $1" >&2; return 1 ;;
  esac
}
WRITE_BODY='{"name":"Ada","email":"ada@example.com","posts":[{"title":"First","body":"Hello"},{"title":"Second","body":"Again"},{"title":"Third","body":"Done"}]}'
