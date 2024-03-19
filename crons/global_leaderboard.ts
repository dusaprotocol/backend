import { Maker, Prisma, Swap } from "@prisma/client";
import { prisma } from "../common/db";


// Function to get the role of the user based on the userAddress

// Function to get the off_chain point from UserRole. Mapping off weight and role from weight 

// Function to get the on_chain point from Swap and Maker.

// Function to calculate streak. This time, if a user have activies either on swap or liquidity providing, then the streak will be counted.

// Function to sum up the off_chain and on_chain point and update in User.score Model 


// The streak function should be triggered every 24 hours. The calculation of user.score should be triggered every Monday at 12PM UTC. 