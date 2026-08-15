import { ConfigLoader } from '@faultless/config';

async function main() {
  const loader = new ConfigLoader({
    sources: [],
    validateOnLoad: false,
    watchForChanges: false,
  });

  await loader.load();
  console.log('Initial config:', loader.getConfig());

  const changeEvents: any[] = [];
  loader.onChange((event) => {
    console.log('Change event:', event);
    changeEvents.push(event);
  });

  console.log('Calling handleConfigChange...');
  (loader as any).handleConfigChange('test-source', {
    app: { name: 'changed-name' },
  });

  console.log('Change events after call:', changeEvents.length);
  console.log('Events:', changeEvents);
}

main().catch(console.error);
