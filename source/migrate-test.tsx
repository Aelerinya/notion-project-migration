import React from 'react';
import MigrationOrchestrator from './migration-orchestrator.js';

type Props = {
	token?: string;
};

export default function MigrateTest({token}: Props) {
	return <MigrationOrchestrator token={token} />;
}