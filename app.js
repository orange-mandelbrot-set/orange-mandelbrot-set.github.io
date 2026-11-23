/**
 * CONFIGURAÇÃO DOS 12 MODELOS (Apêndice A)
 * Edite `scale` para ajustar facilmente o tamanho individual de cada planta.
 * Edite `targetY` (altura do foco da câmera) se alguma árvore for muito alta ou rasteira.
 */
const PLANT_MODELS = [
  {
    id: 1,
    label: '<em>Aechmea bromeliifolia</em>',
    file: './assets/models/modelo1.glb',
    scale: 1.0,
    targetY: 0.55
  },
  {
    id: 2,
    label: '<em>Aechmea nudicaulis</em>',
    file: './assets/models/modelo2.glb',
    scale: 1.8,
    targetY: 0.6
  },
  {
    id: 3,
    label: 'Cedro-rosa (<em>Cedrela fissilis</em>)',
    file: './assets/models/modelo3.glb',
    scale: 0.3,
    targetY: 1.7
  },
  {
    id: 4,
    label: 'Embaúba-prateada (<em>Cecropia hololeuca</em>)',
    file: './assets/models/modelo4.glb',
    scale: 0.3,
    targetY: 2.3
  },
  {
    id: 5,
    label: 'Embaúba-vermelha (<em>Cecropia glaziovii</em>)',
    file: './assets/models/modelo5.glb',
    scale: 0.5,
    targetY: 1.7
  },
  {
    id: 6,
    label: 'Trapoeraba-azul (<em>Commelina erecta</em>)',
    file: './assets/models/modelo6.glb',
    scale: 0.7,
    targetY: 0.4
  },
  {
    id: 7,
    label: 'Jasmim-brasileiro (<em>Mandevilla sanderi</em>)',
    file: './assets/models/modelo7.glb',
    scale: 0.08,
    targetY: 0.65
  },
  {
    id: 8,
    label: 'Araruta (<em>Maranta arundinacea</em>)',
    file: './assets/models/modelo8.glb',
    scale: 0.04,
    targetY: 0.55
  },
  {
    id: 9,
    label: 'Maranta bicolor (<em>Maranta leuconeura</em>)',
    file: './assets/models/modelo9.glb',
    scale: 0.17,
    targetY: 0.4
  },
  {
    id: 10,
    label: 'Cabeludinha (<em>Myrciaria glazioviana</em>)',
    file: './assets/models/modelo10.glb',
    scale: 1.0,
    targetY: 0.95
  },
  {
    id: 11,
    label: 'Erva-da-fortuna (<em>Tradescantia fluminensis</em>)',
    file: './assets/models/modelo11.glb',
    scale: 0.08,
    targetY: 0.35
  },
  {
    id: 12,
    label: 'Orelha-de-onça (<em>Pleroma heteromalla</em>)',
    file: './assets/models/modelo12.glb',
    scale: 1.0,
    targetY: 0.85
  }
];

const AUTO_ROTATE_RESUME_DELAY_MS = 5000;

/**
 * Componente A-Frame para carregar iluminação PBR via arquivo .hdr (Radiance RGBE)
 * sem dependências externas conflitantes.
 */
AFRAME.registerComponent('hdr-environment', {
  schema: {
    src: { type: 'string', default: '' },
    showBackground: { type: 'boolean', default: false }
  },

  init: function () {
    const sceneEl = this.el.sceneEl;
    const setupEnv = () => {
      if (this.data.src) {
        this.loadHDR(this.data.src);
      } else {
        this.applyFallbackLighting();
      }
    };

    if (sceneEl.hasLoaded) {
      setupEnv();
    } else {
      sceneEl.addEventListener('loaded', setupEnv, { once: true });
    }
  },

  async loadHDR(url) {
    const sceneEl = this.el.sceneEl;
    const renderer = sceneEl.renderer;
    const threeScene = sceneEl.object3D;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const hdrTexture = this.parseRGBE(buffer);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const envRT = pmremGenerator.fromEquirectangular(hdrTexture);

      threeScene.environment = envRT.texture;
      if (this.data.showBackground) {
        threeScene.background = envRT.texture;
      }

      hdrTexture.dispose();
      pmremGenerator.dispose();
    } catch (err) {
      console.warn(`[HDR] Não foi possível carregar "${url}". Usando iluminação reserva.`, err);
      this.applyFallbackLighting();
    }
  },

  applyFallbackLighting() {
    // Luz hemisférica reserva caso o arquivo .hdr ainda não esteja na pasta
    const hemiLight = new THREE.HemisphereLight(0xf4f8ff, 0x6b6356, 1.35);
    this.el.sceneEl.object3D.add(hemiLight);
  },

  parseRGBE(buffer) {
    const bytes = new Uint8Array(buffer);
    let pos = 0;

    const readLine = () => {
      let line = '';
      while (pos < bytes.length) {
        const ch = String.fromCharCode(bytes[pos++]);
        if (ch === '\n') break;
        line += ch;
      }
      return line;
    };

    // Cabeçalho Radiance
    let line = readLine();
    if (!line.startsWith('#?')) {
      throw new Error('Cabeçalho RGBE inválido');
    }

    while (pos < bytes.length) {
      line = readLine();
      if (line.trim() === '') break;
    }

    // Dimensões (-Y height +X width)
    const dimLine = readLine().trim();
    const match = dimLine.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
    if (!match) {
      throw new Error('Dimensões RGBE não suportadas');
    }

    const height = parseInt(match[1], 10);
    const width = parseInt(match[2], 10);
    const data = new Uint16Array(width * height * 4);

    const scanline = new Uint8Array(width * 4);

    for (let y = 0; y < height; y++) {
      // Verifica RLE padrão (2, 2, widthHigh, widthLow)
      if (
        bytes[pos] === 2 &&
        bytes[pos + 1] === 2 &&
        ((bytes[pos + 2] << 8) | bytes[pos + 3]) === width
      ) {
        pos += 4;
        for (let ch = 0; ch < 4; ch++) {
          let x = 0;
          while (x < width) {
            const count = bytes[pos++];
            if (count > 128) {
              const run = count - 128;
              const val = bytes[pos++];
              for (let i = 0; i < run; i++) {
                scanline[x * 4 + ch] = val;
                x++;
              }
            } else {
              for (let i = 0; i < count; i++) {
                scanline[x * 4 + ch] = bytes[pos++];
                x++;
              }
            }
          }
        }
      } else {
        // Sem RLE
        for (let x = 0; x < width; x++) {
          scanline[x * 4] = bytes[pos++];
          scanline[x * 4 + 1] = bytes[pos++];
          scanline[x * 4 + 2] = bytes[pos++];
          scanline[x * 4 + 3] = bytes[pos++];
        }
      }

      // Converte RGBE -> Linear Float -> HalfFloat (compatível com Three.js r164 PMREM)
      const rowOffset = (height - 1 - y) * width * 4;
      for (let x = 0; x < width; x++) {
        const sIdx = x * 4;
        const dIdx = rowOffset + x * 4;
        const e = scanline[sIdx + 3];

        if (e === 0) {
          data[dIdx] = 0;
          data[dIdx + 1] = 0;
          data[dIdx + 2] = 0;
        } else {
          const f = Math.pow(2.0, e - 136);
          data[dIdx] = THREE.DataUtils.toHalfFloat(scanline[sIdx] * f);
          data[dIdx + 1] = THREE.DataUtils.toHalfFloat(scanline[sIdx + 1] * f);
          data[dIdx + 2] = THREE.DataUtils.toHalfFloat(scanline[sIdx + 2] * f);
        }
        data[dIdx + 3] = THREE.DataUtils.toHalfFloat(1.0);
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }
});

/**
 * Controlador Principal da Aplicação
 */
document.addEventListener('DOMContentLoaded', () => {
  const sceneEl = document.getElementById('scene');
  const plantContainer = document.getElementById('plant-container');
  const cameraEl = document.getElementById('camera');

  const speciesNameEl = document.getElementById('species-name');
  const counterEl = document.getElementById('model-counter');
  const loaderOverlay = document.getElementById('loader-overlay');
  const loaderText = document.getElementById('loader-text');

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnInfo = document.getElementById('btn-info');
  const btnCloseInfo = document.getElementById('btn-close-info');
  const infoModal = document.getElementById('info-modal');

  let currentIndex = 0;
  let activeModelEl = null;
  let loadToken = 0;
  let autoRotateTimer = null;

  // Limita Pixel Ratio em telas mobile 3x/4x para manter 60fps constantes
  sceneEl.addEventListener('loaded', () => {
    if (sceneEl.renderer) {
      sceneEl.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }
    setupAutoRotateResume();
    loadPlant(0);
  });

  /**
   * Pausa auto-rotação durante toque/arraste e retoma após 5 segundos
   */
  function setupAutoRotateResume() {
    const orbitComp = cameraEl.components['orbit-controls'];
    if (!orbitComp || !orbitComp.controls) return;

    const controls = orbitComp.controls;

    const pauseAutoRotate = () => {
      controls.autoRotate = false;
      if (autoRotateTimer) {
        clearTimeout(autoRotateTimer);
        autoRotateTimer = null;
      }
    };

    const scheduleResumeAutoRotate = () => {
      if (autoRotateTimer) clearTimeout(autoRotateTimer);
      autoRotateTimer = setTimeout(() => {
        if (infoModal.classList.contains('hidden')) {
          controls.autoRotate = true;
        }
      }, AUTO_ROTATE_RESUME_DELAY_MS);
    };

    controls.addEventListener('start', pauseAutoRotate);
    controls.addEventListener('end', scheduleResumeAutoRotate);
  }

  /**
   * Libera completamente geometrias, materiais e texturas KTX2 da GPU/RAM
   */
  function disposeCurrentModel() {
    if (!activeModelEl) return;

    const meshRoot = activeModelEl.getObject3D('mesh');
    if (meshRoot) {
      meshRoot.traverse((node) => {
        if (node.isMesh) {
          if (node.geometry) {
            node.geometry.dispose();
          }
          if (node.material) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach((mat) => {
              // Descarta todos os mapas PBR (albedo, normal, roughness, AO, etc.)
              for (const key of Object.keys(mat)) {
                const value = mat[key];
                if (value && typeof value === 'object' && value.isTexture) {
                  value.dispose();
                }
              }
              mat.dispose();
            });
          }
        }
      });
    }

    if (activeModelEl.parentNode) {
      activeModelEl.parentNode.removeChild(activeModelEl);
    }
    activeModelEl = null;

    if (sceneEl.renderer && sceneEl.renderer.renderLists) {
      sceneEl.renderer.renderLists.dispose();
    }
  }

  /**
   * Carrega o modelo 3D selecionado sob demanda
   */
  function loadPlant(index) {
    currentIndex = (index + PLANT_MODELS.length) % PLANT_MODELS.length;
    const plant = PLANT_MODELS[currentIndex];
    const currentToken = ++loadToken;

    // Atualiza textos imediatamente
    speciesNameEl.innerHTML = plant.label;
    counterEl.textContent = `${currentIndex + 1} / ${PLANT_MODELS.length}`;

    // Exibe loader
    loaderText.textContent = `Carregando modelo ${currentIndex + 1}/12...`;
    loaderOverlay.classList.remove('hidden');

    // Ajusta altura alvo da câmera conforme a planta
    const orbitComp = cameraEl.components['orbit-controls'];
    if (orbitComp && orbitComp.controls) {
      orbitComp.controls.target.set(0, plant.targetY ?? 0.75, 0);
      orbitComp.controls.update();
    }

    // Libera o modelo anterior antes de instanciar o novo
    disposeCurrentModel();

    const newModelEl = document.createElement('a-entity');
    newModelEl.setAttribute('gltf-model', plant.file);
    newModelEl.setAttribute('scale', `${plant.scale} ${plant.scale} ${plant.scale}`);
    newModelEl.setAttribute('position', '0 0 0');

    newModelEl.addEventListener('model-loaded', () => {
      // Ignora caso o usuário já tenha trocado de modelo durante o download
      if (currentToken !== loadToken) {
        activeModelEl = newModelEl;
        disposeCurrentModel();
        return;
      }

      const mesh = newModelEl.getObject3D('mesh');
      if (mesh) {
        mesh.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            // Garante atualização do environment map PBR
            if (node.material) {
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              materials.forEach((mat) => {
                mat.side = THREE.DoubleSide; // Renderiza frente e verso das folhas
                mat.shadowSide = THREE.FrontSide;

                // Corrige a ordenação de profundidade (Z-depth) das folhas
                if (mat.transparent || mat.alphaMap) {
                  mat.transparent = false; // Desativa Alpha Blend
                  mat.alphaTest = 0.5;     // Ativa Alpha Cutout (recorte via Z-buffer)
                  mat.depthWrite = true;   // Grava profundidade real por pixel
                }

                mat.envMapIntensity = 1.0;
                mat.needsUpdate = true;
              });
            }
          }
        });
      }

      loaderOverlay.classList.add('hidden');
    });

    newModelEl.addEventListener('model-error', (err) => {
      if (currentToken !== loadToken) return;
      console.error(`Erro ao carregar ${plant.file}:`, err);
      loaderText.textContent = `Arquivo não encontrado: ${plant.file}`;
    });

    activeModelEl = newModelEl;
    plantContainer.appendChild(newModelEl);
  }

  // Navegação por setas
  btnPrev.addEventListener('click', () => loadPlant(currentIndex - 1));
  btnNext.addEventListener('click', () => loadPlant(currentIndex + 1));

  // Modal de Informações
  btnInfo.addEventListener('click', () => {
    infoModal.classList.remove('hidden');
  });

  btnCloseInfo.addEventListener('click', () => {
    infoModal.classList.add('hidden');
  });

  // Fechar modal tocando fora do cartão
  infoModal.addEventListener('click', (e) => {
    if (e.target === infoModal) {
      infoModal.classList.add('hidden');
    }
  });

  // Atalhos de teclado (útil para testes no desktop)
  window.addEventListener('keydown', (e) => {
    if (!infoModal.classList.contains('hidden')) {
      if (e.key === 'Escape') infoModal.classList.add('hidden');
      return;
    }
    if (e.key === 'ArrowLeft') loadPlant(currentIndex - 1);
    if (e.key === 'ArrowRight') loadPlant(currentIndex + 1);
  });
});