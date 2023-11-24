{ pkgs ? import <nixpkgs> {} }:

let
	nixpkgs_unstable_src = pkgs.fetchFromGitHub {
		owner = "NixOS";
		repo = "nixpkgs";
		rev = "5e4c2ada4fcd54b99d56d7bd62f384511a7e2593";
		sha256 = "sha256-9NJcFF9CEYPvHJ5ckE8kvINvI84SZZ87PvqMbH6pro0=";
	};

	nixpkgs_unstable = import nixpkgs_unstable_src {
		overlays = [
			(self: super: {
				go = super.go_1_21;
			})
		];
	};
in

pkgs.mkShell {
	buildInputs = with nixpkgs_unstable; [
		go
		gopls
		gotools
		deno
	];

	shellHook = ''
		export PATH="$PATH:${builtins.toString ./.}/bin"
	'';
}
