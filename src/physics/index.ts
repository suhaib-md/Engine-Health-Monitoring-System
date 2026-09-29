// Pure shared equations + equation registry (Show the math). Called by both Plant and Twin.
import type { RegisteredEquation } from './registry';
import { basicsEquations } from './basics';
import { torqueEquations } from './torque';
import { frictionEquations } from './friction';
import { energyEquations } from './energy';
import { coolingEquations } from './cooling';
import { oilEquations } from './oil';
import { electricalEquations } from './electrical';
import { sliderCrankEquations } from './sliderCrank';
import { crankEquations } from './crankTorque';
import { vibrationEquations } from './vibration';

export * from './registry';
export * from './basics';
export * from './torque';
export * from './friction';
export * from './energy';
export * from './cooling';
export * from './oil';
export * from './electrical';
export * from './engineModel';
export * from './sliderCrank';
export * from './cycle';
export * from './crankTorque';
export * from './vibration';

export const EQUATIONS: readonly RegisteredEquation[] = [
  ...basicsEquations,
  ...torqueEquations,
  ...frictionEquations,
  ...energyEquations,
  ...coolingEquations,
  ...oilEquations,
  ...electricalEquations,
  ...sliderCrankEquations,
  ...crankEquations,
  ...vibrationEquations,
];

export const equationById = (id: string) => EQUATIONS.find((e) => e.id === id);
