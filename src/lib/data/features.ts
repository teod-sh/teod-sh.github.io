import type { Feature } from "$lib/utils/types";

export default [ 
  {
    name: 'Python',
    description: 'How to and it\'s why\'s',
    image: 'images/features/markdown.jpg',
    tags: [{ label: 'Simple' }, { label: 'Pythonic' }, { label: 'Covering Almost All WTF\'s',  color: 'secondary'}]
  }, 
  {
    name: 'Golang',
    description: 'How to and it\'s why\'s',
    image: 'images/features/themeable.jpg',
    tags: [{ label: 'Simple' }, { label: 'Covering Almost All WTF\'s',  color: 'secondary'}]
  }, 
  {
    name: 'System Design',
    description: 'Comprehensive System Design Explanations And Samples',
    image: 'images/features/extensible.jpg',
		tags: [{ label: 'Simple',  color: 'secondary'}]
  }, 
  {
    name: 'Infra for Devs',
    description: 'How to and it\'s why\'s. Trying to share all the 2 cents that I know about it',
    image: 'images/features/optimized.jpg',
    tags: [{ label: 'Lab',  color: 'secondary'}]
  }, 
  {
    name: 'Databases',
    description: 'Exploring Databases until we return to Postgresql',
    image: 'images/features/light-dark.jpg',
		tags: [{ label: 'Lab',  color: 'secondary'}, { label: 'SQL' }, { label: 'NoSQL' }]
  },
  {
    name: 'DYI - Learning By Doing',
    description: 'Doing one bad decision at a time we understand and build everything we want',
    image: 'images/features/open-source.jpg',
		tags: [{ label: 'Lab',  color: 'secondary'}, { label: 'DYI',  color: 'secondary'}]
  },
] as Feature[];