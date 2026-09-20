export const features = [
  { id: 'anter_configurator.view', title: 'View Anter configurator projects', module: 'anter_configurator' },
  {
    id: 'anter_configurator.internal',
    title: 'Draw in internal configurator mode (full catalogue)',
    module: 'anter_configurator',
    dependsOn: ['anter_configurator.view'],
  },
  {
    id: 'anter_configurator.margin.view',
    title: 'See configurator cost and margin',
    module: 'anter_configurator',
    dependsOn: ['anter_configurator.internal'],
  },
  {
    id: 'anter_configurator.review',
    title: 'Make technical review decisions on submissions',
    module: 'anter_configurator',
    dependsOn: ['anter_configurator.view'],
  },
  {
    id: 'anter_configurator.value',
    title: 'Price custom items and build/issue offers',
    module: 'anter_configurator',
    dependsOn: ['anter_configurator.view'],
  },
  {
    id: 'anter_configurator.force_variant',
    title: 'Force a non-standard product variant onto a custom item',
    module: 'anter_configurator',
    dependsOn: ['anter_configurator.internal'],
  },
  // Portal features — `portal.<area>.<action>` convention (spec §3.14).
  { id: 'portal.configurator.use', title: 'Draw, save and submit configurator projects', module: 'anter_configurator' },
  { id: 'portal.offers.view', title: 'View issued configurator offers', module: 'anter_configurator' },
  {
    id: 'portal.offers.accept',
    title: 'Accept a configurator offer and place the resulting order',
    module: 'anter_configurator',
    dependsOn: ['portal.offers.view'],
  },
]

export default features
