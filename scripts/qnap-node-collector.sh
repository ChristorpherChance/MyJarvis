#!/bin/sh
# Forced SSH command. Reads only OS counters, data-volume metadata, and disk models.
# No Python, containers, file scans, SMART self-tests, or caller commands are used.
set -eu
export LC_ALL=C
base=/etc/config/jarvis-nas
. "$base/node.conf"
printf '%s' "$MACHINE_ID" | grep -Eq '^[0-9a-f-]{36}$'
printf '%s' "$AGENT_ID" | grep -Eq '^[0-9a-f-]{36}$'
work=$(mktemp -d "$base/tmp/observe.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$work/time"
awk 'NR==1 {t=0;for(i=2;i<=9;i++)t+=$i;print t,$5+$6}' /proc/stat > "$work/cpu1"
sleep 0.2
awk 'NR==1 {t=0;for(i=2;i<=9;i++)t+=$i;print t,$5+$6}' /proc/stat > "$work/cpu2"
awk '$2 ~ /^\/share\/CACHEDEV[1-9][0-9]*_DATA$/ && $1 ~ /^\/dev\// {print $2}' /proc/mounts | sort -u > "$work/mounts"
test -s "$work/mounts"
while IFS= read -r mount; do
 df -k -P "$mount" | awk 'NR>1 && $2~/^[0-9]+$/ && $2>0 {print $NF,$2,$3,$4}' >> "$work/volumes"
done < "$work/mounts"
test -s "$work/volumes"
awk '/^MemTotal:/{t=$2}/^MemAvailable:/{a=$2}END{if(t<=0||a<=0||a>t)exit 1;print t,a}' /proc/meminfo > "$work/memory"
awk '{print $1}' /proc/loadavg > "$work/load"
awk '{print int($1)}' /proc/uptime > "$work/uptime"
touch "$work/disks"
/sbin/qcli_storage -d 2>/dev/null | awk '$1=="NAS_HOST"&&$2~/^[1-9][0-9]*$/&&$3~/^\/dev\/sd[a-z]+$/ {model="";for(i=5;i<NF;i++)if($i=="--"&&$(i+1)~/^[0-9]+$/){for(j=i+2;j<=NF;j++){if(model=="")model=$j;else model=model" "$j;}break}print $2,$3,$4,model}' > "$work/devices"
while read -r slot device type model; do
 block=${device#/dev/}
 if test -z "$model"; then model=$(tr -d '\n\r\t' < "/sys/block/$block/device/model"); fi
 sectors=$(cat "/sys/block/$block/size")
 case "$type" in SSD:*) type=ssd;; HDD:*) type=hdd;; *) continue;; esac
 printf '%s\t%s\t%s\t%s\n' "$slot" "$type" "$sectors" "$model" >> "$work/disks"
done < "$work/devices"
version=$(/sbin/getcfg System Version -f /etc/config/uLinux.conf)
build=$(/sbin/getcfg System 'Build Number' -f /etc/config/uLinux.conf)
printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'
printf '%s' "$build" | grep -Eq '^[0-9]{8}$'
awk -v version="$version" -v build="$build" -v model="$MODEL" '
function n(x,s){s=sprintf("%.3f",x);sub(/0+$/,"",s);sub(/\.$/,"",s);return s}
function esc(x){gsub(/\\/,"\\\\",x);gsub(/\"/,"\\\"",x);gsub(/[[:cntrl:]]/,"",x);return x}
FILENAME~/\/cpu1$/{t1=$1;i1=$2}
FILENAME~/\/cpu2$/{t2=$1;i2=$2}
FILENAME~/\/memory$/{mem=$1;avail=$2}
FILENAME~/\/load$/{load=$1}
FILENAME~/\/uptime$/{uptime=$1}
FILENAME~/\/time$/{stamp=$1}
FILENAME~/\/volumes$/{
 id=$1;sub(/^\/share\/CACHEDEV/,"",id);sub(/_DATA$/,"",id);
 if(id!~/^[1-9][0-9]*$/||$2<=0||$3<0||$4<0||$3+$4>$2)exit 2;
 total+=$2;used+=$3;free+=$4;
 if(vols!="")vols=vols",";
 vols=vols"{\"freeGB\":"n($4/1048576)",\"id\":"id",\"mount\":\""$1"\",\"totalGB\":"n($2/1048576)",\"usedGB\":"n($3/1048576)"}";
}
FILENAME~/\/disks$/{
 split($0,d,"\t");if(d[1]+0<1||d[3]+0<=0)exit 2;
 if(disks!="")disks=disks",";
 disks=disks"{\"capacityGB\":"n(d[3]*512/1073741824)",\"model\":\""esc(d[4])"\",\"slot\":"d[1]",\"type\":\""d[2]"\"}";
}
END{
 if(total<=0||t2<=t1||mem<=0||stamp=="")exit 2;
 cpu=(1-(i2-i1)/(t2-t1))*100;if(cpu<0)cpu=0;if(cpu>100)cpu=100;
 printf "{\"leases\":[],\"metrics\":{\"cpuPercent\":%s,\"diskFreeGB\":%s,\"diskPercent\":%s,\"diskTotalGB\":%s,\"load1\":%s,\"memoryPercent\":%s,\"memoryTotalGB\":%s,\"memoryUsedGB\":%s,\"uptimeSec\":%d},\"storage\":{\"build\":\"%s\",\"disks\":[%s],\"kind\":\"qnap\",\"model\":\"%s\",\"observedAt\":\"%s\",\"systemVersion\":\"%s\",\"volumes\":[%s]}}",n(cpu),n(free/1048576),n(used/total*100),n(total/1048576),n(load),n((mem-avail)/mem*100),n(mem/1048576),n((mem-avail)/1048576),uptime,build,disks,model,stamp,version,vols;
}' "$work/cpu1" "$work/cpu2" "$work/memory" "$work/load" "$work/uptime" "$work/time" "$work/volumes" "$work/disks" > "$work/body"
hash=$(openssl dgst -sha256 "$work/body" | awk '{print $NF}')
nonce=$(openssl rand -base64 24 | tr '/+' '_-' | tr -d '=\n\r')
stamp=$(cat "$work/time")
path="/api/v1/agents/$AGENT_ID/heartbeat"
printf 'POST\n%s\n%s\n%s\n%s' "$path" "$stamp" "$nonce" "$hash" > "$work/payload"
openssl pkeyutl -sign -rawin -inkey "$base/signing.key" -in "$work/payload" -out "$work/signature"
signature=$(openssl base64 -A -in "$work/signature" | tr '/+' '_-' | tr -d '=\n\r')
printf '{"version":1,"method":"POST","path":"%s","agentId":"%s","machineId":"%s","headers":{"x-jarvis-nonce":"%s","x-jarvis-signature":"%s","x-jarvis-timestamp":"%s"},"body":' "$path" "$AGENT_ID" "$MACHINE_ID" "$nonce" "$signature" "$stamp"
cat "$work/body"
printf '}\n'
