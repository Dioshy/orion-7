# Interception Orion-7

Combat spatial newtonien dans le navigateur (Three.js r187, Vite). Défendez la station Orion-7
contre dix vagues de chasseurs, intercepteurs, drones-suicides, bombardiers porte-torpilles et
frégates lourdes, puis continuez en mode infini.

**Jouer en ligne : https://dioshy.github.io/orion-7/**

## Lancer

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # version statique dans dist/ (hébergeable telle quelle)
    npm run preview    # sert dist/
    npm run build:single  # un seul fichier autonome : dist-single/index.html

La version d'origine (fichier unique) est conservée dans `legacy/index.html`.

## Contenu

- **Hangar** avant chaque sortie : le vaisseau est présenté sur le pont, on choisit son équipement
  et on dépense les **crédits** gagnés à chaque sortie (score et vagues repoussées). Tout est sauvegardé.
  - **3 vaisseaux** : Orion Mk II (polyvalent), Vipère (intercepteur rapide et fragile, un réacteur,
    plans canard), Rempart (canonnière lourde à double poutre, quatre réacteurs, trois canons, dix missiles).
  - **3 armes** : canons cinétiques, lasers à impulsions (rayons instantanés), canon à plasma (explosions de zone).
  - **4 capacités** (touche Z / W en AZERTY) : Égide (invulnérabilité), Onde IEM (détruit missiles et
    torpilles, paralyse les ennemis), Saut de phase (bond de 700 m), Drone ailier (allié pendant 25 s).
  - **3 propulsions** : postcombustion, propulseur à impulsions (3 charges), réacteur à fusion (endurance).
  - **5 livrées**.

- **Deux vues** (V) : poursuite, ou cockpit 3D modélisé (verrière, planche de bord, manche latéral et
  manette des gaz animés, écrans multifonctions en direct : radar, systèmes, cible ; voyants dont le
  train d'atterrissage).
- **Pilotage** : rotations pilotées par propulseurs (inertie), rétro-postcombustion (Maj + S) pour
  freiner brutalement ou reculer, manche au neutre après le décollage.
- **Sensations** : arrêt sur image aux destructions, épaves en vrille, recul des canons, coup de poing
  de la postcombustion, missiles esquivés ou leurrés récompensés, passages rasants sonores,
  vibrations de la manette.
- **Lumière** : ombres portées du soleil, lumière bleutée renvoyée par la planète, reflet de lentille,
  boules de feu volumétriques, peinture vernie avec panneaux et marquages, halo réglable.

- **Départ au sol** : le vaisseau est posé sur le pont d'envol, train sorti. On met les gaz, on roule
  sur la piste balisée (feux séquentiels, portiques), le train se rentre au décollage, puis un couloir
  de balises lumineuses mène au combat (bonus « décollage parfait »). Même chose à chaque vaisseau de réserve.
- **Intercepteur Orion Mk II** : train d'atterrissage animé (trappes, jambes, vérins, patins, phare),
  flammes de réacteurs volumétriques, rétrofusées au freinage, propulseurs d'attitude, missiles visibles
  sous les ailes, feux de navigation.
- **Sensation de vitesse** : 320 m/s en croisière, 720 m/s en postcombustion ; recul de la caméra à
  l'accélération, champ de vision dynamique, flou radial et aberration chromatique, traînées de poussière,
  champ d'astéroïdes comme repères.

- **Ennemis** : chasseurs, intercepteurs (missiles à tête chercheuse dès la vague 5), essaims de
  drones-suicides, bombardiers porte-torpilles, et une frégate « Léviathan » toutes les 5 vagues
  (bouclier à abattre via ses générateurs, tourelles, moteurs, lancement de chasseurs, torpilles lourdes).
- **Progression** : une amélioration au choix (1 parmi 3) après chaque vague : canons, cadence,
  refroidissement, 3ᵉ canon, missiles en salve, boucliers, blindage, nanorobots, leurres, aimant,
  tourelles de défense pour la station, réparations…
- **Score** : combos multiplicateurs (jusqu'à ×5), annonces (doublé, triplé…), primes de vague,
  bonus « sans dégâts », lancement anticipé (Entrée), médailles et records locaux.
- **Caissons** lâchés par les ennemis : réparation, munitions, bouclier, surcharge des canons.
- **Défense** : leurres (C) contre les missiles, ciblage de la torpille la plus urgente (Tab),
  temps avant impact affiché, ravitaillement devant le hangar.
- **Trois difficultés**, tutoriel contextuel à la première sortie, paramètres persistants
  (volumes, qualité, sensibilité, champ de vision, tremblements, inversion du tangage).
- **Commandes** : souris capturée (manche virtuel), clavier AZERTY/QWERTY détecté, manette standard.

## Technique

- Rendu en deux passes (arrière-plan lointain puis combat), HDR + bloom, tonemapping ACES,
  résolution dynamique en qualité automatique.
- Planète, nébuleuse et lune générées par shaders ; atmosphère par diffusion de Rayleigh/Mie calculée
  par lancer de rayons, ombres des nuages, orages côté nuit, rayons de soleil volumétriques, nébuleuse
  précalculée dans une cubemap HDR.
- Particules GPU en tampon unique, traçantes instanciées, modèles fusionnés par matériau,
  pools d'objets : pas d'allocation dans la boucle de jeu.
- Simulation à pas fixes (≤ 1/60 s) : comportement identique à 30, 60 ou 144 i/s.
- Son et musique 100 % synthétisés (Web Audio) : effets spatialisés, musique générative
  dont l'intensité suit le combat.

## Structure

    src/core     utilitaires, paramètres, entrées, audio
    src/render   moteur de rendu, arrière-plan, particules, modèles, poussière
    src/game     état, joueur, ennemis, frégate, armes, station, vagues, score, améliorations
    src/ui       HUD, menus, messages radio, tutoriel
