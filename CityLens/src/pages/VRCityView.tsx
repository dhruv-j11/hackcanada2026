import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { OrbitControls } from '@react-three/drei'
import { useState } from 'react'
import * as THREE from 'three'

const xrStore = createXRStore()

function CityGrid() {
  const buildings = []

  for (let x = -10; x < 10; x++) {
    for (let z = -10; z < 10; z++) {
      const isRoad = x % 3 === 0 || z % 3 === 0
      if (isRoad) continue

      const height = 8 + Math.random() * 7
      const isNearION = Math.abs(x) < 2
      buildings.push(
        <mesh key={`${x}-${z}`} position={[x * 5, height / 2, z * 5]}>
          <boxGeometry args={[4, height, 4]} />
          <meshStandardMaterial
            color={isNearION ? '#1e3a5f' : '#1a2744'}
            roughness={0.8}
          />
        </mesh>
      )
    }
  }

  return <group>{buildings}</group>
}

function ProposedBuildings({ visible }: { visible: boolean }) {
  if (!visible) return null

  const proposed = [
    { pos: [0, 10.5, 0], height: 21, width: 4.5, depth: 8 },
    { pos: [6, 9, -5], height: 18, width: 5, depth: 6 },
    { pos: [-5, 12, 3], height: 24, width: 4, depth: 7 },
    { pos: [3, 10.5, 8], height: 21, width: 6, depth: 5 },
  ]

  return (
    <group>
      {proposed.map((b, i) => (
        <mesh key={i} position={b.pos as [number, number, number]}>
          <boxGeometry args={[b.width, b.height, b.depth]} />
          <meshStandardMaterial
            color="#2563EB"
            transparent
            opacity={0.8}
            roughness={0.3}
            metalness={0.2}
            emissive="#1d4ed8"
            emissiveIntensity={0.15}
          />
        </mesh>
      ))}
    </group>
  )
}

function IONLine() {
  const points = [
    new THREE.Vector3(0, 0.2, -50),
    new THREE.Vector3(0, 0.2, 50),
  ]
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points)
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#06B6D4', linewidth: 3 })
  const lineObj = new THREE.Line(lineGeometry, lineMaterial)

  return (
    <primitive object={lineObj} />
  )
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#0a1628" roughness={1} />
    </mesh>
  )
}

export default function VRCityView() {
  const [showProposed, setShowProposed] = useState(false)

  return (
    <div className="w-full h-screen bg-black relative">
      <div className="absolute top-4 left-4 z-10 flex gap-3 flex-wrap">
        <button
          onClick={() => xrStore.enterVR()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-medium"
        >
          Enter VR
        </button>
        <button
          onClick={() => xrStore.enterAR()}
          className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 font-medium"
        >
          Enter AR
        </button>
        <button
          onClick={() => setShowProposed(!showProposed)}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            showProposed ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {showProposed ? 'Hide Proposed' : 'Show Proposed'}
        </button>
        <a href="/city/waterloo" className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors">
          ← Back to Map
        </a>
      </div>

      {showProposed && (
        <div className="absolute bottom-4 left-4 z-10 bg-[#111D32]/90 backdrop-blur-md p-4 rounded-xl border border-[#1E3050] max-w-sm animate-fade-in-up">
          <h3 className="text-white font-semibold mb-2 text-lg">Proposed: 6-Storey Mixed Use</h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">Blue buildings represent proposed development along the ION corridor. Walk through the scene in VR to experience the scale.</p>
          <div className="grid grid-cols-2 gap-2 text-sm bg-[#0F2035] p-3 rounded-lg border border-[#1E3050]">
            <div className="text-blue-400 font-bold text-center">+840 units</div>
            <div className="text-cyan-400 font-bold text-center">+$2.1M/yr tax</div>
          </div>
        </div>
      )}

      <Canvas camera={{ position: [30, 25, 30], fov: 60 }}>
        <XR store={xrStore}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[50, 50, 25]} intensity={0.8} castShadow />
          <pointLight position={[0, 30, 0]} intensity={0.3} color="#3B82F6" />

          <Ground />
          <CityGrid />
          <ProposedBuildings visible={showProposed} />
          <IONLine />

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={10}
            maxDistance={100}
          />

          <fog attach="fog" args={['#0a1628', 60, 150]} />
        </XR>
      </Canvas>
    </div>
  )
}
