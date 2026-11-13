# The vCPU split inside the rig, so Node, the load tool, Postgres and monitoring never share a core.
SERVER_CORES=2
POSTGRES_CORES=3-5
OHA_CORES=6-8
MONITOR_CORES=0-1
