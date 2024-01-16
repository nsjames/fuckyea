#include <eosio/eosio.hpp>
using namespace eosio;

CONTRACT mycontract : public contract {
    public:
        using contract::contract;

        // This is a database model definition
        TABLE user {
            name     eos_account;
            uint8_t  is_admin;

            uint64_t primary_key() const {
                return eos_account.value;
            }
        };

        // This is a table constructor which we will instantiate later
        using user_table = eosio::multi_index<"users"_n, user>;

        // Every ACTION you define can be called from outside the blockchain
        ACTION newuser( name eos_account ){
            // Only the account calling this can add themselves
            require_auth(eos_account);

            // We're instantiating the user table
            user_table users(get_self(), get_self().value);

            // Finally, we're putting that user into the database
            users.emplace(get_self(), [&](auto& row) {
                row = user {
                    .eos_account = eos_account,
                    .is_admin = 0
                };
            });
        }
};
