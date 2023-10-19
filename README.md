# dol-server

An extensible server for serving the [Degrees of
Lewdity](https://www.vrelnir.com/) game.

## Features

- Serve the game over HTTP
- Sync save files to a remote server
- Save file conflict resolution (latest first, manual conflict prompt otherwise)
- Extensible Go API for adding new server-side features

## Why?

Using Tailscale allows your devices to access things by just going to
`http://$HOSTNAME`, and since I play DoL on multiple devices, I wanted to be
able to access my save files from any of them.

With this server, you can set up your own domain so that `dol.example.com` will
always point to your server, and you can access your save files from anywhere.

## Usage

First, build the server:

```sh
go build
```

Then, edit the `dol-server.json` config. Make sure to change `game_path` to the
folder that your game is downloaded to.

Then, run it:

```sh
./dol-server -l :8000 -c dol-server.json
```

It is recommended to use something like Caddy to serve the server over a proper
Tailscale domain name:

```sh
./dol-server -l unix:///tmp/dol-server.sock -c dol-server.json
```

```
dol.x.ts.net {
    reverse_proxy unix//tmp/dol-server.sock
}
```
