/**
 * Wave Connect hero — interactive WebGL identity-mesh.
 *
 * Ported from the design source's vanilla three.js prototype into a typed
 * ES-module entry. The motif system is unchanged: `jelly` is the default,
 * `orb` and `mesh` are alternates exposed via `window.__setMotif()` so the
 * design tweaks panel can swap motifs at runtime.
 *
 * Performance posture:
 * - PixelRatio capped at 2 — past that, 4K + HiDPI starts dropping frames
 *   on integrated GPUs without a perceivable quality gain.
 * - The render loop pauses when the canvas is off-screen via
 *   IntersectionObserver — continuous WebGL kills phone batteries.
 * - `prefers-reduced-motion` users get a single static frame instead of
 *   the full animation loop.
 */

import * as THREE from "three";
import { brand, site } from "~/lib/colors";

type Motif = "jelly" | "orb" | "mesh" | "off";

interface MotifBuilder {
	update(t: number): void;
}

/**
 * Hero palette — anchored to brand teal.
 *
 * `TEAL` (brand primitive `#1d3a44`) is the base material color: MeshStandard
 * catches the coral rim light and reflects it, which is how we get form.
 *
 * `TEAL` (brand `--wc-teal-muted` `#4e6b74`, same family) is the
 * emissive layer and everywhere a surface isn't lit — line segments and
 * MeshBasicMaterial nodes don't respond to DirectionalLight, so they'd be
 * invisible at pure #1d3a44 against the #0a0a12 canvas. The muted teal
 * sits in the same hue family, keeping the scene "teal" while staying
 * legible.
 *
 * VIOLET stays as the secondary accent (from the design tweak palette).
 * CREAM (brand) stays for the wireframe overlay + half the orbital nodes.
 */
const TEAL = new THREE.Color(brand.teal);
const TEAL_GLOW = new THREE.Color(brand.tealMuted);
const VIOLET = new THREE.Color(site.violet);
const CREAM = new THREE.Color(brand.cream);

export function mountHeroScene(): void {
	const canvasEl = document.getElementById(
		"hero-canvas",
	) as HTMLCanvasElement | null;
	if (!canvasEl) return;
	// Re-bind as a non-nullable const so the nested closures (setMotif,
	// resize, IntersectionObserver) don't have to re-narrow.
	const canvas: HTMLCanvasElement = canvasEl;

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setClearColor(0x000000, 0);

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
	camera.position.set(0, 0, 8);

	scene.add(new THREE.AmbientLight(0xffffff, 0.4));
	const key = new THREE.DirectionalLight(0xffffff, 1.0);
	key.position.set(4, 5, 6);
	scene.add(key);
	const rim = new THREE.DirectionalLight(TEAL, 1.8);
	rim.position.set(-4, -3, -4);
	scene.add(rim);
	const fill = new THREE.DirectionalLight(VIOLET, 1.2);
	fill.position.set(3, -2, 3);
	scene.add(fill);

	const root = new THREE.Group();
	scene.add(root);

	let motif: Motif = "jelly";
	let builder: MotifBuilder | null = null;

	function clearRoot() {
		while (root.children.length) {
			const c = root.children.pop() as THREE.Object3D & {
				geometry?: THREE.BufferGeometry;
				material?: THREE.Material | THREE.Material[];
			};
			c.geometry?.dispose();
			if (c.material) {
				if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
				else c.material.dispose();
			}
		}
	}

	// === Jellyfish: central pulsing bell + tendrils + orbital nodes ===
	function buildJelly(): MotifBuilder {
		clearRoot();
		const bellGeom = new THREE.SphereGeometry(1.4, 64, 48);
		const bellMat = new THREE.MeshStandardMaterial({
			// Dark brand teal reflects the teal-glow rim light + violet fill,
			// giving form. Pure #1d3a44 would vanish against #0a0a12 canvas
			// without the emissive layer below.
			color: TEAL,
			roughness: 0.3,
			metalness: 0.4,
			// Muted teal (#4e6b74) at 0.5× provides the baseline luminance —
			// slightly bumped vs. the old amber scene (was 0.3) because the
			// darker base color needs more emissive to register.
			emissive: TEAL.clone().multiplyScalar(0.5),
			emissiveIntensity: 0.8,
			transparent: true,
			opacity: 0.85,
		});
		const bell = new THREE.Mesh(bellGeom, bellMat);
		root.add(bell);

		const wireGeom = new THREE.IcosahedronGeometry(1.65, 2);
		const wireMat = new THREE.MeshBasicMaterial({
			color: CREAM,
			wireframe: true,
			transparent: true,
			opacity: 0.12,
		});
		root.add(new THREE.Mesh(wireGeom, wireMat));

		type Tendril = { line: THREE.Line; pts: THREE.Vector3[]; phase: number };
		const tendrils: Tendril[] = [];
		for (let i = 0; i < 10; i++) {
			const pts: THREE.Vector3[] = [];
			const angle = (i / 10) * Math.PI * 2;
			const baseX = Math.cos(angle) * 0.5;
			const baseZ = Math.sin(angle) * 0.5;
			for (let j = 0; j <= 20; j++) {
				const t = j / 20;
				pts.push(
					new THREE.Vector3(
						baseX * (1 - t * 0.3),
						-0.5 - t * 2.5,
						baseZ * (1 - t * 0.3),
					),
				);
			}
			const g = new THREE.BufferGeometry().setFromPoints(pts);
			// LineBasicMaterial isn't lit, so the dark brand teal wouldn't
			// read — use the muted-teal family token so the tendrils stay
			// on-brand and visible.
			const col = i % 2 === 0 ? TEAL_GLOW : VIOLET;
			const m = new THREE.LineBasicMaterial({
				color: col,
				transparent: true,
				opacity: 0.5,
			});
			const line = new THREE.Line(g, m);
			tendrils.push({
				line,
				pts: pts.map((p) => p.clone()),
				phase: Math.random() * Math.PI * 2,
			});
			root.add(line);
		}

		type Node = {
			mesh: THREE.Mesh;
			r: number;
			theta: number;
			phi: number;
			speed: number;
		};
		const N = 30;
		const nodes: Node[] = [];
		for (let i = 0; i < N; i++) {
			const r = 2.4 + Math.random() * 1.2;
			const theta = Math.random() * Math.PI * 2;
			const phi = (Math.random() - 0.5) * Math.PI;
			const geom = new THREE.SphereGeometry(
				0.04 + Math.random() * 0.04,
				12,
				12,
			);
			// MeshBasicMaterial isn't lit either — use the muted-teal family
			// so the orbital nodes are visible against the dark canvas.
			const col = Math.random() > 0.5 ? TEAL_GLOW : CREAM;
			const mat = new THREE.MeshBasicMaterial({
				color: col,
				transparent: true,
				opacity: 0.8,
			});
			const mesh = new THREE.Mesh(geom, mat);
			nodes.push({ mesh, r, theta, phi, speed: 0.15 + Math.random() * 0.3 });
			root.add(mesh);
		}

		const edgeCount = 18;
		const edgeGeom = new THREE.BufferGeometry();
		const edgePos = new Float32Array(edgeCount * 6);
		edgeGeom.setAttribute("position", new THREE.BufferAttribute(edgePos, 3));
		const edgeMat = new THREE.LineBasicMaterial({
			color: CREAM,
			transparent: true,
			opacity: 0.12,
		});
		const edges = new THREE.LineSegments(edgeGeom, edgeMat);
		root.add(edges);

		const origBell = (
			bellGeom.attributes["position"]!.array as Float32Array
		).slice();

		return {
			update(t) {
				const p = bellGeom.attributes["position"]!;
				for (let i = 0; i < p.count; i++) {
					const x = origBell[i * 3]!;
					const y = origBell[i * 3 + 1]!;
					const z = origBell[i * 3 + 2]!;
					const n =
						Math.sin(t * 1.2 + x * 2 + y * 1.6) * 0.05 +
						Math.cos(t * 0.9 + z * 2) * 0.04;
					const s = 1 + n;
					p.setXYZ(i, x * s, y * s, z * s);
				}
				p.needsUpdate = true;
				bellGeom.computeVertexNormals();

				for (const td of tendrils) {
					const g = td.line.geometry;
					const pp = g.attributes["position"]!;
					for (let j = 0; j < td.pts.length; j++) {
						const o = td.pts[j]!;
						const depth = j / td.pts.length;
						const wave = Math.sin(t * 2 + depth * 4 + td.phase) * 0.2 * depth;
						pp.setXYZ(
							j,
							o.x + wave,
							o.y + Math.cos(t * 1.3 + depth * 3) * 0.1 * depth,
							o.z + wave * 0.5,
						);
					}
					pp.needsUpdate = true;
				}

				for (const n of nodes) {
					const a = n.theta + t * n.speed;
					n.mesh.position.set(
						n.r * Math.cos(n.phi) * Math.cos(a),
						n.r * Math.sin(n.phi) + Math.sin(t * 0.8 + n.theta) * 0.3,
						n.r * Math.cos(n.phi) * Math.sin(a),
					);
				}

				const ep = edges.geometry.attributes["position"]!;
				for (let i = 0; i < edgeCount; i++) {
					const nd = nodes[i % nodes.length]!;
					ep.setXYZ(i * 2, 0, 0, 0);
					ep.setXYZ(
						i * 2 + 1,
						nd.mesh.position.x,
						nd.mesh.position.y,
						nd.mesh.position.z,
					);
				}
				ep.needsUpdate = true;

				root.rotation.y = t * 0.1;
				root.rotation.x = Math.sin(t * 0.2) * 0.06;
				root.position.y = Math.sin(t * 0.5) * 0.1;
			},
		};
	}

	// === Orb: faceted icosahedron with breathing surface ===
	function buildOrb(): MotifBuilder {
		clearRoot();
		const geom = new THREE.IcosahedronGeometry(1.8, 3);
		const mat = new THREE.MeshStandardMaterial({
			// Same two-tone pattern as the jelly bell: dark brand teal for
			// lit form + muted-teal emissive for baseline luminance.
			color: TEAL,
			roughness: 0.3,
			metalness: 0.6,
			emissive: TEAL.clone().multiplyScalar(0.5),
			emissiveIntensity: 0.8,
			flatShading: true,
		});
		const orb = new THREE.Mesh(geom, mat);
		root.add(orb);

		const wire = new THREE.Mesh(
			new THREE.IcosahedronGeometry(2.1, 2),
			new THREE.MeshBasicMaterial({
				color: CREAM,
				wireframe: true,
				transparent: true,
				opacity: 0.14,
			}),
		);
		root.add(wire);

		const orig = (geom.attributes["position"]!.array as Float32Array).slice();

		return {
			update(t) {
				const p = geom.attributes["position"]!;
				for (let i = 0; i < p.count; i++) {
					const x = orig[i * 3]!;
					const y = orig[i * 3 + 1]!;
					const z = orig[i * 3 + 2]!;
					const n =
						Math.sin(t * 1.2 + x * 2 + y * 1.5) * 0.04 +
						Math.cos(t * 0.8 + z * 2) * 0.03;
					const s = 1 + n;
					p.setXYZ(i, x * s, y * s, z * s);
				}
				p.needsUpdate = true;
				geom.computeVertexNormals();

				root.rotation.y = t * 0.12;
				root.rotation.x = Math.sin(t * 0.2) * 0.08;
				wire.rotation.x = -t * 0.1;
				wire.rotation.z = t * 0.07;
			},
		};
	}

	// === Mesh: ring of 24 connected nodes ===
	function buildMesh(): MotifBuilder {
		clearRoot();
		const R = 2.2;
		const NN = 24;
		type RingNode = { mesh: THREE.Mesh; a: number; y: number };
		const ringNodes: RingNode[] = [];
		for (let i = 0; i < NN; i++) {
			const a = (i / NN) * Math.PI * 2;
			const y = Math.sin(a * 3) * 0.6;
			const isAccent = i % 3 === 0;
			const m = new THREE.Mesh(
				new THREE.SphereGeometry(0.08, 16, 16),
				new THREE.MeshStandardMaterial({
					// Accent nodes: dark brand teal lit by rim + muted-teal glow.
					// Non-accent nodes: cream, no emissive.
					color: isAccent ? TEAL : CREAM,
					emissive: isAccent ? TEAL : new THREE.Color(0),
					emissiveIntensity: 0.6,
					metalness: 0.5,
					roughness: 0.3,
				}),
			);
			m.position.set(R * Math.cos(a), y, R * Math.sin(a));
			ringNodes.push({ mesh: m, a, y });
			root.add(m);
		}

		const g = new THREE.BufferGeometry();
		const pos = new Float32Array(NN * 6);
		for (let i = 0; i < NN; i++) {
			const a = ringNodes[i]!.mesh.position;
			const b = ringNodes[(i + 1) % NN]!.mesh.position;
			pos[i * 6] = a.x;
			pos[i * 6 + 1] = a.y;
			pos[i * 6 + 2] = a.z;
			pos[i * 6 + 3] = b.x;
			pos[i * 6 + 4] = b.y;
			pos[i * 6 + 5] = b.z;
		}
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		const mesh = new THREE.LineSegments(
			g,
			// Unlit line — use the muted-teal family so the edges stay
			// visible against the dark canvas.
			new THREE.LineBasicMaterial({
				color: TEAL,
				transparent: true,
				opacity: 0.5,
			}),
		);
		root.add(mesh);

		return {
			update(t) {
				for (const n of ringNodes) {
					const a = n.a + t * 0.2;
					n.mesh.position.set(
						R * Math.cos(a),
						n.y + Math.sin(t + a * 3) * 0.3,
						R * Math.sin(a),
					);
				}
				const pp = mesh.geometry.attributes["position"]!;
				for (let i = 0; i < NN; i++) {
					const a = ringNodes[i]!.mesh.position;
					const b = ringNodes[(i + 1) % NN]!.mesh.position;
					pp.setXYZ(i * 2, a.x, a.y, a.z);
					pp.setXYZ(i * 2 + 1, b.x, b.y, b.z);
				}
				pp.needsUpdate = true;

				root.rotation.y = t * 0.15;
				root.rotation.x = Math.sin(t * 0.3) * 0.15;
			},
		};
	}

	function setMotif(v: Motif): void {
		motif = v;
		canvas.style.display = v === "off" ? "none" : "";
		if (v === "jelly") builder = buildJelly();
		else if (v === "orb") builder = buildOrb();
		else if (v === "mesh") builder = buildMesh();
		else builder = null;
	}
	// Expose so design / tweaks panel can swap motifs at runtime.
	(window as Window & { __setMotif?: (v: Motif) => void }).__setMotif =
		setMotif;
	setMotif("jelly");

	function resize() {
		const r = canvas.getBoundingClientRect();
		renderer.setSize(r.width, r.height, false);
		camera.aspect = r.width / Math.max(r.height, 1);
		camera.updateProjectionMatrix();
	}
	window.addEventListener("resize", resize);
	resize();

	// Subtle parallax — track and lerp the cursor offset for a smooth follow.
	let mx = 0;
	let my = 0;
	let tmx = 0;
	let tmy = 0;
	window.addEventListener("mousemove", (e) => {
		tmx = (e.clientX / window.innerWidth - 0.5) * 2;
		tmy = (e.clientY / window.innerHeight - 0.5) * 2;
	});

	// Pause the loop when the hero is off-screen — saves real battery on
	// long pages where the user is scrolling well below the fold.
	let onscreen = true;
	if (typeof IntersectionObserver !== "undefined") {
		new IntersectionObserver(
			(entries) => {
				onscreen = entries[0]?.isIntersecting ?? true;
			},
			{ threshold: 0 },
		).observe(canvas);
	}

	// Reduced-motion users get a single static frame.
	const reducedMotion =
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	const clock = new THREE.Clock();
	let t = 0;
	function loop() {
		if (!reducedMotion) requestAnimationFrame(loop);
		if (!onscreen && !reducedMotion) return;
		t += clock.getDelta();
		mx += (tmx - mx) * 0.06;
		my += (tmy - my) * 0.06;
		builder?.update(t);
		root.rotation.y += mx * 0.02;
		root.rotation.x += my * 0.01;
		renderer.render(scene, camera);
	}
	loop();
	// Suppress unused-variable warning — `motif` is read by external callers
	// through __setMotif; keeping the variable typed makes that contract
	// explicit.
	void motif;
}
